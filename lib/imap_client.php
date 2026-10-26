<?php

declare(strict_types=1);

/** Server errors are reported generically: IMAP replies are never shown to the user verbatim. */
final class ImapException extends RuntimeException
{
    public function __construct(string $message, public readonly string $kind = 'protocol')
    {
        parent::__construct($message);
    }
}

interface ImapTransport
{
    public function readLine(): string;
    public function read(int $bytes): string;
    public function write(string $data): void;
    public function close(): void;
}

final class ImapSocketTransport implements ImapTransport
{
    /** @var resource */
    private $stream;

    public function __construct(string $host, int $port, int $timeout)
    {
        $context = stream_context_create(['ssl' => ['verify_peer' => true, 'verify_peer_name' => true, 'peer_name' => $host, 'SNI_enabled' => true]]);
        $stream = @stream_socket_client('ssl://' . $host . ':' . $port, $code, $message, $timeout, STREAM_CLIENT_CONNECT, $context);
        if ($stream === false) throw new ImapException('Could not reach the mail server over a secure connection.', 'connect');
        stream_set_timeout($stream, $timeout);
        $this->stream = $stream;
    }

    public function readLine(): string
    {
        $line = fgets($this->stream);
        if ($line === false) $this->fail();
        return $line;
    }

    public function read(int $bytes): string
    {
        $data = '';
        while (strlen($data) < $bytes) {
            $chunk = fread($this->stream, min(65536, $bytes - strlen($data)));
            if ($chunk === false || $chunk === '') $this->fail();
            $data .= $chunk;
        }
        return $data;
    }

    public function write(string $data): void
    {
        if (fwrite($this->stream, $data) !== strlen($data)) $this->fail();
    }

    public function close(): void
    {
        fclose($this->stream);
    }

    private function fail(): never
    {
        $timedOut = stream_get_meta_data($this->stream)['timed_out'] ?? false;
        throw new ImapException($timedOut ? 'The mail server took too long to answer.' : 'The mail server closed the connection.', 'connect');
    }
}

/** A minimal read-only IMAP4rev1 client: LOGIN, EXAMINE, SEARCH and FETCH over implicit TLS. */
final class ImapClient
{
    private const MAX_LITERAL = 2_000_000;
    private int $tag = 0;

    public function __construct(private readonly ImapTransport $io)
    {
        [$greeting] = $this->response();
        if (!str_starts_with($greeting, '* OK') && !str_starts_with($greeting, '* PREAUTH')) throw new ImapException('The mail server refused the connection.', 'connect');
    }

    public static function open(string $host, int $port, int $timeout = 20): self
    {
        return new self(new ImapSocketTransport($host, $port, $timeout));
    }

    public function login(string $user, string $password): void
    {
        try {
            $this->command(['LOGIN', $this->astring($user), $this->astring($password)]);
        } catch (ImapException $error) {
            throw $error->kind === 'connect' ? $error : new ImapException('The mail server rejected the email address or app password.', 'auth');
        }
    }

    /** Opens a mailbox read-only, so fetching never marks mail as read. Returns the message count. */
    public function examine(string $mailbox = 'INBOX'): int
    {
        foreach ($this->command(['EXAMINE', $this->astring($mailbox)]) as [$line]) {
            if (preg_match('/^\* (\d+) EXISTS/i', $line, $match)) return (int) $match[1];
        }
        return 0;
    }

    /** @return list<int> UIDs of messages received on or after $day (server dates have day granularity). */
    public function searchSince(DateTimeInterface $day): array
    {
        $uids = [];
        foreach ($this->command(['UID SEARCH SINCE', $day->format('j-M-Y')]) as [$line]) {
            if (preg_match('/^\* SEARCH((?: \d+)*)\s*$/i', $line, $match)) foreach (preg_split('/ /', trim($match[1]), -1, PREG_SPLIT_NO_EMPTY) as $uid) $uids[] = (int) $uid;
        }
        sort($uids);
        return $uids;
    }

    /**
     * Fetches flags, arrival time and the first $bytes of each message.
     * $set is a sequence set ("41:70") or, with $byUid, a UID set ("12,15").
     * @return list<array{uid:int, flags:list<string>, internalDate:?string, raw:string}>
     */
    public function fetch(string $set, int $bytes, bool $byUid = false): array
    {
        if (!preg_match('/^[0-9]+(?::[0-9*]+)?(?:,[0-9]+(?::[0-9*]+)?)*$/D', $set)) throw new InvalidArgumentException('Invalid message set.');
        $messages = [];
        foreach ($this->command([($byUid ? 'UID FETCH ' : 'FETCH ') . $set, '(UID FLAGS INTERNALDATE BODY.PEEK[]<0.' . $bytes . '>)']) as [$line, $literals]) {
            if (!preg_match('/^\* \d+ FETCH \(/i', $line) || !preg_match('/\bUID (\d+)/i', $line, $uid)) continue;
            preg_match('/\bFLAGS \(([^)]*)\)/i', $line, $flags);
            preg_match('/\bINTERNALDATE "([^"]+)"/i', $line, $date);
            $raw = '';
            if (preg_match('/\bBODY\[\](?:<\d+>)? (?:\x00(\d+)\x00|"((?:[^"\\\\]|\\\\.)*)")/i', $line, $body)) {
                $raw = ($body[1] ?? '') !== '' ? $literals[(int) $body[1]] : stripcslashes($body[2] ?? '');
            }
            $messages[] = ['uid' => (int) $uid[1], 'flags' => preg_split('/\s+/', trim($flags[1] ?? ''), -1, PREG_SPLIT_NO_EMPTY), 'internalDate' => $date[1] ?? null, 'raw' => $raw];
        }
        return $messages;
    }

    public function logout(): void
    {
        try { $this->command(['LOGOUT']); } catch (ImapException) { /* Closing anyway. */ }
        $this->io->close();
    }

    /**
     * Sends one command (parts joined by spaces; a ['literal', $bytes] part is sent as a
     * synchronizing literal) and returns its untagged responses once the tagged OK arrives.
     * @return list<array{0:string, 1:list<string>}>
     */
    private function command(array $parts): array
    {
        $tag = 'L' . (++$this->tag);
        $buffer = $tag;
        foreach ($parts as $part) {
            if (is_array($part)) {
                $this->io->write($buffer . ' {' . strlen($part[1]) . "}\r\n");
                [$continuation] = $this->response();
                if (!str_starts_with($continuation, '+')) throw new ImapException('The mail server did not accept the request.');
                $buffer = $part[1];
                continue;
            }
            $buffer .= ' ' . $part;
        }
        $this->io->write($buffer . "\r\n");
        $untagged = [];
        while (true) {
            $response = $this->response();
            if (str_starts_with($response[0], $tag . ' ')) {
                if (!preg_match('/^' . $tag . ' OK\b/i', $response[0])) throw new ImapException('The mail server did not accept the request.');
                return $untagged;
            }
            $untagged[] = $response;
        }
    }

    /** Reads one response, replacing each {n} literal with a \0index\0 marker. */
    private function response(): array
    {
        $line = $this->io->readLine();
        $literals = [];
        while (preg_match('/\{(\d+)\}\r?\n$/', $line, $match)) {
            $size = (int) $match[1];
            if ($size > self::MAX_LITERAL) throw new ImapException('A message was too large to read.');
            $literals[] = $this->io->read($size);
            $line = substr($line, 0, -strlen($match[0])) . "\x00" . (count($literals) - 1) . "\x00" . $this->io->readLine();
        }
        return [rtrim($line, "\r\n"), $literals];
    }

    private function astring(string $value): string|array
    {
        if (preg_match('/[\x00\r\n]/', $value)) throw new InvalidArgumentException('Invalid characters.');
        return preg_match('/^[\x20-\x7e]*$/D', $value) ? '"' . addcslashes($value, '"\\') . '"' : ['literal', $value];
    }
}
