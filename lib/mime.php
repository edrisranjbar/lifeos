<?php

declare(strict_types=1);

/**
 * Parses a raw (possibly truncated) RFC 5322 message into display fields and plain text.
 * @return array{fromName:string, fromEmail:string, subject:string, date:?int, messageId:string, text:string}
 */
function mime_parse_message(string $raw, int $maxText = 4000): array
{
    [$headers, $body] = mime_split($raw);
    [$fromName, $fromEmail] = mime_address(mime_header_text($headers['from'] ?? ''));
    $date = isset($headers['date']) ? strtotime(preg_replace('/\s*\([^)]*\)\s*$/', '', $headers['date'])) : false;
    $text = mime_body_text($headers, $body, 0);
    return [
        'fromName' => $fromName,
        'fromEmail' => $fromEmail,
        'subject' => mime_clean_line(mime_header_text($headers['subject'] ?? '')),
        'date' => $date === false ? null : $date,
        'messageId' => trim($headers['message-id'] ?? '', " <>\t"),
        'text' => mime_excerpt($text, $maxText),
    ];
}

/** @return array{0: array<string,string>, 1: string} lower-cased, unfolded headers and the body */
function mime_split(string $raw): array
{
    $raw = str_replace("\r\n", "\n", $raw);
    $end = strpos($raw, "\n\n");
    $head = $end === false ? $raw : substr($raw, 0, $end);
    $body = $end === false ? '' : substr($raw, $end + 2);
    $headers = [];
    foreach (explode("\n", preg_replace("/\n[ \t]+/", ' ', $head)) as $line) {
        $colon = strpos($line, ':');
        if ($colon === false) continue;
        $name = strtolower(trim(substr($line, 0, $colon)));
        // The first occurrence wins, as mail clients display it.
        if ($name !== '' && !isset($headers[$name])) $headers[$name] = trim(substr($line, $colon + 1));
    }
    return [$headers, $body];
}

/** Decodes RFC 2047 encoded words to UTF-8. */
function mime_header_text(string $value): string
{
    if ($value === '') return '';
    if (str_contains($value, '=?')) {
        $value = preg_replace('/\?=\s+=\?/', '?==?', $value);
        $decoded = @iconv_mime_decode($value, ICONV_MIME_DECODE_CONTINUE_ON_ERROR, 'UTF-8');
        if ($decoded !== false) $value = $decoded;
    }
    return mime_to_utf8($value, 'utf-8');
}

/** @return array{0:string, 1:string} display name and address of the first mailbox */
function mime_address(string $value): array
{
    if (preg_match('/^\s*"?(.*?)"?\s*<([^<>\s]+@[^<>\s]+)>/', $value, $match)) {
        $name = mime_clean_line(stripcslashes($match[1]));
        return [$name !== '' ? $name : $match[2], strtolower($match[2])];
    }
    if (preg_match('/([^\s<>(),;"]+@[^\s<>(),;"]+)/', $value, $match)) return [$match[1], strtolower($match[1])];
    return [mime_clean_line($value) ?: 'Unknown sender', ''];
}

/** @return array{0:string, 1:array<string,string>} lower-cased media type and parameters */
function mime_media_type(string $value): array
{
    $parts = explode(';', $value);
    $type = strtolower(trim(array_shift($parts))) ?: 'text/plain';
    $params = [];
    foreach ($parts as $part) {
        if (preg_match('/^\s*([\w*-]+)\s*=\s*"?([^"]*)"?\s*$/', $part, $match)) $params[strtolower($match[1])] = $match[2];
    }
    return [$type, $params];
}

/** Picks the best readable text from a (multipart) body: text/plain, else text/html as text. */
function mime_body_text(array $headers, string $body, int $depth): string
{
    [$type, $params] = mime_media_type($headers['content-type'] ?? 'text/plain');
    if ($depth > 6) return '';
    if (str_starts_with($type, 'multipart/') && ($params['boundary'] ?? '') !== '') {
        $plain = $html = '';
        foreach (array_slice(explode('--' . $params['boundary'], $body), 1) as $section) {
            if (str_starts_with($section, '--')) break;
            [$partHeaders, $partBody] = mime_split(ltrim($section, "\r\n"));
            if (str_starts_with(strtolower($partHeaders['content-disposition'] ?? ''), 'attachment')) continue;
            [$partType] = mime_media_type($partHeaders['content-type'] ?? 'text/plain');
            $text = mime_body_text($partHeaders, $partBody, $depth + 1);
            if ($text === '') continue;
            if ($partType === 'text/html') $html = $html ?: $text;
            else $plain = $plain ?: $text;
        }
        return $plain !== '' ? $plain : $html;
    }
    if (!str_starts_with($type, 'text/')) return '';
    $encoding = strtolower(trim($headers['content-transfer-encoding'] ?? ''));
    if ($encoding === 'base64') {
        // A partial fetch can cut the body mid-group; decode the whole groups only.
        $clean = preg_replace('/[^A-Za-z0-9+\/=]/', '', $body);
        $body = (string) base64_decode(substr($clean, 0, intdiv(strlen($clean), 4) * 4));
    }
    elseif ($encoding === 'quoted-printable') $body = quoted_printable_decode($body);
    $body = mime_to_utf8($body, $params['charset'] ?? 'utf-8');
    return $type === 'text/html' ? mime_html_text($body) : $body;
}

function mime_to_utf8(string $value, string $charset): string
{
    $charset = strtolower(trim($charset, " \"'"));
    if (in_array($charset, ['', 'utf-8', 'utf8', 'us-ascii', 'ascii'], true)) return mb_scrub($value, 'UTF-8');
    if (in_array(strtoupper($charset), array_map('strtoupper', mb_list_encodings()), true)) return mb_convert_encoding($value, 'UTF-8', $charset);
    $converted = @iconv($charset, 'UTF-8//IGNORE', $value);
    return mb_scrub($converted === false ? $value : $converted, 'UTF-8');
}

function mime_html_text(string $html): string
{
    $html = preg_replace('#<(script|style|head)\b[^>]*>.*?</\1>#is', ' ', $html);
    $html = preg_replace('#<(br|/p|/div|/tr|/li|/h[1-6])\b[^>]*>#i', "\n", $html);
    return html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8');
}

/** Readable excerpt: no quoted replies, no long URLs, collapsed whitespace. */
function mime_excerpt(string $text, int $max): string
{
    $lines = [];
    foreach (preg_split('/\R/u', $text) as $line) {
        $line = trim($line);
        if (str_starts_with($line, '>')) continue;
        // Stop at the start of a quoted earlier message.
        if (preg_match('/^On .{6,120} wrote:$/u', $line) || preg_match('/^-{2,} ?Original Message ?-{2,}$/i', $line)) break;
        $lines[] = preg_replace('#https?://\S{40,}#', '[link]', $line);
    }
    $text = trim(preg_replace("/\n{3,}/", "\n\n", preg_replace('/[ \t\x{00A0}]+/u', ' ', implode("\n", $lines))));
    return mb_strlen($text) > $max ? rtrim(mb_substr($text, 0, $max)) . '…' : $text;
}

function mime_clean_line(string $value): string
{
    return trim(preg_replace('/[\s\x{00A0}]+/u', ' ', preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', '', $value)));
}
