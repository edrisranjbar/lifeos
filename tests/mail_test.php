<?php

declare(strict_types=1);

// Email inbox and daily summary against in-memory SQLite, a scripted IMAP server
// and a fake AI transport; no config.php, network or real mailbox is used.
putenv('LIFEOS_SECRET_KEY=mail-test-only-key');
putenv('LIFEOS_TIMEZONE=UTC');
require_once dirname(__DIR__) . '/lib/mail.php';

$db = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
$db->exec('CREATE TABLE mail_accounts (user_id INTEGER PRIMARY KEY, imap_host TEXT NOT NULL, imap_user TEXT NOT NULL, imap_secret TEXT NOT NULL, ai_provider TEXT NOT NULL DEFAULT \'\', ai_model TEXT NOT NULL DEFAULT \'\', ai_base_url TEXT NOT NULL DEFAULT \'\', ai_secret TEXT NULL, inbox_json TEXT NULL, inbox_at INTEGER NULL, digest_attempt_at INTEGER NULL, updated_at TEXT NULL)');
$db->exec('CREATE TABLE mail_digests (user_id INTEGER NOT NULL, digest_date TEXT NOT NULL, summary TEXT NOT NULL, message_count INTEGER NOT NULL, total_count INTEGER NOT NULL, model TEXT NOT NULL DEFAULT \'\', created_at INTEGER NOT NULL, PRIMARY KEY (user_id, digest_date))');
$checks = 0;
function check(bool $condition, string $label): void { global $checks; if (!$condition) throw new RuntimeException('FAIL: ' . $label); $checks++; }
function fails(callable $action, int $status, string $label, string $contains = ''): void {
    try { $action(); } catch (ApiException $error) {
        check($error->status === $status, $label . ' (got ' . $error->status . ': ' . $error->getMessage() . ')');
        if ($contains !== '') check(str_contains($error->getMessage(), $contains), $label . ' message');
        return;
    }
    throw new RuntimeException('FAIL: expected error: ' . $label);
}

/** Answers like a real IMAP server: read-only mailbox, synchronizing literals, partial fetches. */
final class FakeImapServer implements ImapTransport
{
    public array $commands = [];
    public bool $closed = false;
    public bool $literalLogin = false;
    private string $out = "* OK fake IMAP ready\r\n";
    private ?string $pendingLogin = null;

    public function __construct(private array $messages, private string $user, private string $password) {}

    public function readLine(): string
    {
        $end = strpos($this->out, "\n");
        if ($end === false) throw new ImapException('The mail server closed the connection.', 'connect');
        $line = substr($this->out, 0, $end + 1);
        $this->out = substr($this->out, $end + 1);
        return $line;
    }

    public function read(int $bytes): string
    {
        $data = substr($this->out, 0, $bytes);
        $this->out = substr($this->out, $bytes);
        return $data;
    }

    public function close(): void { $this->closed = true; }

    public function write(string $data): void
    {
        if ($this->pendingLogin !== null) {
            $tag = $this->pendingLogin;
            $this->pendingLogin = null;
            $this->answerLogin($tag, $this->loginUser, rtrim($data, "\r\n"));
            return;
        }
        $line = rtrim($data, "\r\n");
        $this->commands[] = preg_replace('/^(L\d+ LOGIN "[^"]*") .*/', '$1 ***', $line);
        [$tag, $command] = explode(' ', $line, 2);
        if (preg_match('/^LOGIN "((?:[^"\\\\]|\\\\.)*)" \{(\d+)\}$/', $command, $match)) {
            $this->loginUser = stripcslashes($match[1]);
            $this->pendingLogin = $tag;
            $this->literalLogin = true;
            $this->out .= "+ Ready for literal\r\n";
        } elseif (preg_match('/^LOGIN "((?:[^"\\\\]|\\\\.)*)" "((?:[^"\\\\]|\\\\.)*)"$/', $command, $match)) {
            $this->answerLogin($tag, stripcslashes($match[1]), stripcslashes($match[2]));
        } elseif (str_starts_with($command, 'EXAMINE')) {
            $this->out .= '* ' . count($this->messages) . " EXISTS\r\n* OK [READ-ONLY]\r\n$tag OK [READ-ONLY] EXAMINE completed\r\n";
        } elseif (str_starts_with($command, 'SELECT') || str_contains($command, 'STORE')) {
            $this->out .= "$tag BAD read-only test server\r\n";
        } elseif (str_starts_with($command, 'UID SEARCH SINCE')) {
            $this->out .= '* SEARCH ' . implode(' ', array_column($this->messages, 'uid')) . "\r\n$tag OK SEARCH completed\r\n";
        } elseif (preg_match('/^(UID )?FETCH (\S+) \(UID FLAGS INTERNALDATE BODY\.PEEK\[\]<0\.(\d+)>\)$/', $command, $match)) {
            $wanted = [];
            foreach (explode(',', $match[2]) as $range) {
                [$from, $to] = array_pad(explode(':', $range), 2, null);
                $wanted[] = [(int) $from, (int) ($to ?? $from)];
            }
            foreach ($this->messages as $index => $message) {
                $id = $match[1] ? $message['uid'] : $index + 1;
                if (!array_filter($wanted, fn ($range) => $id >= $range[0] && $id <= $range[1])) continue;
                $body = substr($message['raw'], 0, (int) $match[3]);
                $this->out .= '* ' . ($index + 1) . ' FETCH (UID ' . $message['uid'] . ' FLAGS (' . $message['flags'] . ') INTERNALDATE "' . gmdate('d-M-Y H:i:s +0000', $message['time']) . '" BODY[]<0> {' . strlen($body) . "}\r\n" . $body . ")\r\n";
            }
            $this->out .= "$tag OK FETCH completed\r\n";
        } elseif ($command === 'LOGOUT') {
            $this->out .= "* BYE\r\n$tag OK LOGOUT completed\r\n";
        } else {
            $this->out .= "$tag BAD unknown\r\n";
        }
    }

    private string $loginUser = '';

    private function answerLogin(string $tag, string $user, string $password): void
    {
        $this->out .= $user === $this->user && $password === $this->password ? "$tag OK LOGIN completed\r\n" : "$tag NO [AUTHENTICATIONFAILED] Invalid credentials ($password)\r\n";
    }
}

$now = 1792_600_000;
$crlf = fn (string $text) => str_replace("\n", "\r\n", $text);
$messages = [
    ['uid' => 101, 'flags' => '\\Seen', 'time' => $now - 3 * 86400, 'raw' => $crlf("From: Old News <news@example.com>\nSubject: Last week\nMessage-ID: <old@example.com>\n\nOld message.")],
    ['uid' => 102, 'flags' => '', 'time' => $now - 3600, 'raw' => $crlf("From: =?UTF-8?B?2LnZhNuM?= <ali@example.com>\nSubject: =?UTF-8?Q?Invoice_due_Friday_=E2=80=93_please_pay?=\nMessage-ID: <inv-1@example.com>\nContent-Type: text/plain; charset=UTF-8\nContent-Transfer-Encoding: quoted-printable\n\nHi,=0Athe invoice of 120 USD is due on Friday.\n\nOn Mon, 19 Oct 2026 at 10:00 Someone <x@example.com> wrote:\n> older quoted text\n")],
    ['uid' => 103, 'flags' => '\\Seen \\Flagged', 'time' => $now - 600, 'raw' => $crlf("From: \"Team, Ops\" <ops@example.com>\nSubject: Deploy report\nMessage-ID: <deploy@example.com>\nContent-Type: multipart/alternative; boundary=\"b1\"\n\n--b1\nContent-Type: text/html; charset=UTF-8\nContent-Transfer-Encoding: base64\n\n" . chunk_split(base64_encode('<html><style>p{color:red}</style><body><p>Deploy &amp; rollout finished.</p><p>All green.</p></body></html>'), 76, "\n") . "--b1--\n")],
];
$servers = [];
$connect = function (string $host, int $port) use (&$servers, $messages): ImapClient {
    check($host === 'imap.gmail.com' && $port === 993, 'connects to the saved host over port 993');
    $server = new FakeImapServer($messages, 'me@gmail.com', 'app-pass word');
    $servers[] = $server;
    return new ImapClient($server);
};

// MIME parsing: encoded headers, quoted-printable, quoted replies, HTML-only and truncated bodies.
$invoice = mime_parse_message($messages[1]['raw']);
check($invoice['fromName'] === 'علی' && $invoice['fromEmail'] === 'ali@example.com', 'encoded sender name decoded');
check($invoice['subject'] === 'Invoice due Friday – please pay', 'encoded subject decoded');
check(str_contains($invoice['text'], 'due on Friday') && !str_contains($invoice['text'], 'older quoted'), 'quoted earlier message removed');
$deploy = mime_parse_message($messages[2]['raw']);
check($deploy['fromName'] === 'Team, Ops' && $deploy['text'] === "Deploy & rollout finished.\nAll green.", 'HTML-only part converted to text without styles');
$cut = mime_parse_message(substr($messages[2]['raw'], 0, 260));
check(is_string($cut['text']), 'truncated base64 body still parses');

// Secrets are bound to their owner and purpose.
$sealed = secret_box_seal('secret', 'ctx-a');
check(secret_box_open($sealed, 'ctx-a') === 'secret' && secret_box_open($sealed, 'ctx-b') === null, 'sealed secret opens only in its own context');

// Settings: the mailbox is tested before anything is saved, and secrets are stored encrypted.
fails(fn () => mail_save_settings($db, ['imap_host' => 'imap.gmail.com', 'imap_user' => 'me@gmail.com', 'imap_password' => 'wrong'], $connect), 422, 'wrong app password refused', 'app password');
check(mail_account($db) === null, 'nothing saved after a failed sign-in');
check(!str_contains(implode("\n", array_merge(...array_map(fn ($server) => $server->commands, $servers))), 'wrong'), 'password never appears in the command log');
fails(fn () => mail_save_settings($db, ['imap_host' => 'http://evil', 'imap_user' => 'me', 'imap_password' => 'x'], $connect), 422, 'host must be a server name');
fails(fn () => mail_save_settings($db, ['imap_host' => 'imap.gmail.com', 'imap_user' => 'me@gmail.com', 'imap_password' => 'app-pass word', 'ai_provider' => 'anthropic', 'ai_model' => 'claude-opus-5-5'], $connect), 422, 'AI key required for a hosted provider');
$view = mail_save_settings($db, ['action' => 'save', 'imap_host' => 'IMAP.gmail.com', 'imap_user' => 'me@gmail.com', 'imap_password' => 'app-pass word'], $connect);
check($view['connected'] && $view['imap']['host'] === 'imap.gmail.com' && $view['ai']['provider'] === '', 'mailbox saved without AI');
check(!str_contains(json_encode($view), 'app-pass'), 'settings view never includes the password');
$row = mail_account($db);
check(!str_contains($row['imap_secret'], 'app-pass') && mail_imap_password($row) === 'app-pass word', 'password stored encrypted');
check(end($servers)->closed && in_array('L2 EXAMINE "INBOX"', end($servers)->commands, true), 'mailbox opened read-only and closed');

// Inbox: newest first, unread flags, Gmail links, cached for ten minutes.
$inbox = mail_inbox($db, mail_account($db), false, $connect, $now);
check(array_column($inbox['messages'], 'uid') === [103, 102, 101], 'inbox newest first');
check($inbox['messages'][1]['unread'] === true && $inbox['messages'][0]['unread'] === false, 'unread flag from IMAP flags');
check($inbox['messages'][1]['link'] === 'https://mail.google.com/mail/u/0/#search/rfc822msgid:inv-1%40example.com', 'Gmail link by Message-ID');
check(!isset($inbox['messages'][0]['text']) && $inbox['messages'][0]['snippet'] !== '', 'inbox keeps a short snippet only');
$connections = count($servers);
mail_inbox($db, mail_account($db), false, $connect, $now + 60);
check(count($servers) === $connections, 'cached inbox does not reconnect');
mail_inbox($db, mail_account($db), true, $connect, $now + 60);
check(count($servers) === $connections + 1, 'refresh reconnects');

// Daily summary.
fails(fn () => mail_generate_digest($db, mail_account($db), $connect, null, $now), 409, 'summary needs an AI provider');
$requests = [];
$http = function (string $method, string $url, array $headers, ?string $body) use (&$requests): array {
    $requests[] = compact('method', 'url', 'headers', 'body');
    if (str_contains($url, '/v1/models')) {
        return str_contains($url, 'after_id')
            ? ['status' => 200, 'body' => json_encode(['data' => [['id' => 'claude-haiku-5-5', 'display_name' => 'Claude Haiku 5.5']], 'has_more' => false])]
            : ['status' => 200, 'body' => json_encode(['data' => [['id' => 'claude-opus-5-5', 'display_name' => 'Claude Opus 5.5']], 'has_more' => true, 'last_id' => 'claude-opus-5-5'])];
    }
    return ['status' => 200, 'body' => json_encode(['stop_reason' => 'end_turn', 'content' => [['type' => 'thinking', 'thinking' => ''], ['type' => 'text', 'text' => "Two emails today.\n## Deadlines and bills\n- Ali: invoice due Friday"]]])];
};
mail_save_settings($db, ['imap_host' => 'imap.gmail.com', 'imap_user' => 'me@gmail.com', 'ai_provider' => 'anthropic', 'ai_model' => 'claude-opus-5-5', 'ai_key' => 'sk-ant-test-key'], $connect);
$row = mail_account($db);
check(count($servers) === $connections + 1, 'changing only AI settings does not re-test the mailbox');
check(!str_contains($row['ai_secret'], 'sk-ant') && mail_ai_config($row)['key'] === 'sk-ant-test-key', 'AI key stored encrypted');
$digest = mail_generate_digest($db, $row, $connect, $http, $now);
$call = end($requests);
$sent = json_decode($call['body'], true);
check($call['url'] === 'https://api.anthropic.com/v1/messages' && in_array('x-api-key: sk-ant-test-key', $call['headers'], true) && in_array('anthropic-version: 2023-06-01', $call['headers'], true), 'Claude request uses the saved key and API version');
check($sent['model'] === 'claude-opus-5-5' && $sent['fallbacks'] === 'default' && in_array('anthropic-beta: server-side-fallback-2026-07-01', $call['headers'], true), 'refusal fallbacks enabled for Opus 5.5');
check(str_contains($sent['system'], 'untrusted data') && str_contains($sent['messages'][0]['content'], 'Invoice due Friday') && str_contains($sent['messages'][0]['content'], 'Deploy report'), 'prompt holds the last day of mail');
check(!str_contains($sent['messages'][0]['content'], 'Old message'), 'mail older than 24 hours left out');
check($digest['summary'] === "Two emails today.\n## Deadlines and bills\n- Ali: invoice due Friday" && $digest['count'] === 2 && $digest['model'] === 'claude-opus-5-5', 'summary stored without thinking blocks');
check(mail_digest($db, $now)['summary'] === $digest['summary'] && mail_digest($db, $now + 86400) === null, 'summary belongs to today only');
fails(fn () => mail_generate_digest($db, mail_account($db), $connect, $http, $now + 30), 429, 'repeated requests are throttled');
$refusal = fn () => ['status' => 200, 'body' => json_encode(['stop_reason' => 'refusal', 'content' => []])];
fails(fn () => mail_generate_digest($db, mail_account($db), $connect, $refusal, $now + 600), 502, 'refusal reported', 'declined');
$rejected = fn () => ['status' => 401, 'body' => json_encode(['error' => ['message' => 'invalid x-api-key sk-ant-test-key']])];
fails(fn () => mail_generate_digest($db, mail_account($db), $connect, $rejected, $now + 1200), 502, 'rejected key reported', 'rejected the API key');
try { mail_generate_digest($db, mail_account($db), $connect, $rejected, $now + 1800); } catch (ApiException $error) { check(!str_contains($error->getMessage(), 'sk-ant-test-key'), 'provider error never repeats the key'); }

// Model lists from every provider.
$models = ai_list_models(['provider' => 'anthropic', 'key' => 'k'], $http);
check(array_column($models, 'id') === ['claude-opus-5-5', 'claude-haiku-5-5'], 'Claude models listed across pages');
$openai = ai_list_models(['provider' => 'openai', 'key' => 'k'], fn () => ['status' => 200, 'body' => json_encode(['data' => [['id' => 'text-embedding-x'], ['id' => 'chat-b'], ['id' => 'chat-a'], ['id' => 'tts-1']]])]);
check(array_column($openai, 'id') === ['chat-a', 'chat-b'], 'OpenAI list keeps text models only');
$gemini = ai_list_models(['provider' => 'gemini', 'key' => 'k'], fn () => ['status' => 200, 'body' => json_encode(['models' => [['name' => 'models/gem-pro', 'displayName' => 'Gem Pro', 'supportedGenerationMethods' => ['generateContent']], ['name' => 'models/embed', 'supportedGenerationMethods' => ['embedContent']]]])]);
check($gemini === [['id' => 'gem-pro', 'name' => 'Gem Pro']], 'Gemini list keeps generateContent models');
$seen = '';
$local = ai_complete(['provider' => 'openai_compatible', 'model' => 'llama3.2', 'key' => '', 'baseUrl' => 'http://localhost:11434/v1/'], 's', 'p', function ($method, $url, $headers) use (&$seen) { $seen = $url . '|' . implode(',', $headers); return ['status' => 200, 'body' => json_encode(['choices' => [['message' => ['content' => ' ok ']]]])]; });
check($local === 'ok' && $seen === 'http://localhost:11434/v1/chat/completions|', 'local OpenAI-compatible server without a key');
foreach (['http://example.com/v1', 'ftp://example.com', 'https://user:pw@example.com', 'https://example.com/v1?x=1'] as $url) {
    try { ai_base_url($url); throw new RuntimeException('FAIL: accepted ' . $url); } catch (AiException) { $checks++; }
}
$geminiCall = '';
ai_complete(['provider' => 'gemini', 'model' => 'gem-pro', 'key' => 'gk'], 'sys', 'hi', function ($method, $url, $headers, $body) use (&$geminiCall) { $geminiCall = $url . '|' . $headers[0] . '|' . $body; return ['status' => 200, 'body' => json_encode(['candidates' => [['content' => ['parts' => [['text' => 'g1'], ['text' => 'g2']]]]]])]; });
check(str_starts_with($geminiCall, 'https://generativelanguage.googleapis.com/v1beta/models/gem-pro:generateContent|x-goog-api-key: gk|') && str_contains($geminiCall, '"systemInstruction"'), 'Gemini request shape');

// Non-ASCII passwords are sent as IMAP literals.
$unicode = new FakeImapServer([], 'me@gmail.com', 'رمز عبور');
$client = new ImapClient($unicode);
$client->login('me@gmail.com', 'رمز عبور');
check($unicode->literalLogin, 'non-ASCII password sent as a literal');

// Disconnecting removes credentials and summaries.
check(mail_disconnect($db)['connected'] === false && mail_account($db) === null && (int) $db->query('SELECT COUNT(*) FROM mail_digests')->fetchColumn() === 0, 'disconnect removes everything');

echo "mail checks passed: $checks\n";
