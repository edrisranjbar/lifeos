<?php

declare(strict_types=1);

/** Providers a user can pick for summaries; each user brings their own API key. */
const AI_PROVIDERS = [
    'anthropic' => 'Anthropic (Claude)',
    'openai' => 'OpenAI',
    'gemini' => 'Google Gemini',
    'openai_compatible' => 'OpenAI-compatible (OpenRouter, Groq, Ollama…)',
];
// Claude models that accept server-side refusal fallbacks ("default" routing by refusal category).
const AI_ANTHROPIC_FALLBACK_MODELS = ['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5'];

final class AiException extends RuntimeException {}

/** @return array{status:int, body:string} */
function ai_http(string $method, string $url, array $headers, ?string $body): array
{
    $handle = curl_init($url);
    $local = (bool) preg_match('#^http://(localhost|127\.0\.0\.1|\[::1\])(:\d+)?/#i', $url);
    $options = [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 150,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_PROTOCOLS => $local ? CURLPROTO_HTTP : CURLPROTO_HTTPS,
        CURLOPT_HTTPHEADER => array_merge(['Accept: application/json'], $body === null ? [] : ['Content-Type: application/json'], $headers),
        CURLOPT_USERAGENT => 'Edi Life OS mail summary/1.0',
    ];
    if ($body !== null) $options[CURLOPT_POSTFIELDS] = $body;
    // Windows PHP often lacks a configured CA bundle; use the OS certificate store.
    if (PHP_OS_FAMILY === 'Windows' && defined('CURLSSLOPT_NATIVE_CA')) $options[CURLOPT_SSL_OPTIONS] = CURLSSLOPT_NATIVE_CA;
    curl_setopt_array($handle, $options);
    $response = curl_exec($handle);
    $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
    if ($response === false) throw new AiException('Could not reach the AI provider. Check the connection and try again.');
    return ['status' => $status, 'body' => (string) $response];
}

/** HTTPS only, except a model server on this machine (for example Ollama). */
function ai_base_url(string $url): string
{
    $url = rtrim(trim($url), '/');
    $parts = parse_url($url);
    $host = strtolower($parts['host'] ?? '');
    $local = in_array($host, ['localhost', '127.0.0.1', '[::1]'], true);
    if (!$parts || !in_array($parts['scheme'] ?? '', ['https', 'http'], true) || $host === '' || isset($parts['user']) || isset($parts['query']) || isset($parts['fragment'])
        || (($parts['scheme'] ?? '') === 'http' && !$local) || strlen($url) > 255) {
        throw new AiException('Use an https:// API address (http:// only for a model server on this machine).');
    }
    return $url;
}

function ai_model_id(string $model): string
{
    if (!preg_match('/^[A-Za-z0-9._:\/@+-]{1,200}$/D', $model)) throw new AiException('Choose a model.');
    return $model;
}

/** @param array{provider:string, key:string, baseUrl?:string} $config @return list<array{id:string, name:string}> */
function ai_list_models(array $config, ?callable $http = null): array
{
    $http ??= 'ai_http';
    $key = $config['key'];
    $models = [];
    switch ($config['provider']) {
        case 'anthropic':
            $after = null;
            for ($page = 0; $page < 5; $page++) {
                $data = ai_call($http, 'GET', 'https://api.anthropic.com/v1/models?limit=1000' . ($after ? '&after_id=' . rawurlencode($after) : ''), ai_anthropic_headers($key), null, $key);
                foreach ($data['data'] ?? [] as $model) if (is_string($model['id'] ?? null)) $models[] = ['id' => $model['id'], 'name' => (string) ($model['display_name'] ?? $model['id'])];
                if (empty($data['has_more']) || !is_string($data['last_id'] ?? null)) break;
                $after = $data['last_id'];
            }
            return $models;
        case 'gemini':
            $data = ai_call($http, 'GET', 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', ['x-goog-api-key: ' . $key], null, $key);
            foreach ($data['models'] ?? [] as $model) {
                if (!in_array('generateContent', $model['supportedGenerationMethods'] ?? [], true) || !is_string($model['name'] ?? null)) continue;
                $id = preg_replace('#^models/#', '', $model['name']);
                $models[] = ['id' => $id, 'name' => (string) ($model['displayName'] ?? $id)];
            }
            return $models;
        case 'openai':
        case 'openai_compatible':
            $base = $config['provider'] === 'openai' ? 'https://api.openai.com/v1' : ai_base_url($config['baseUrl'] ?? '');
            $data = ai_call($http, 'GET', $base . '/models', $key !== '' ? ['Authorization: Bearer ' . $key] : [], null, $key);
            foreach ($data['data'] ?? [] as $model) {
                $id = $model['id'] ?? null;
                // OpenAI also lists speech, image and embedding models that cannot write text.
                if (!is_string($id) || ($config['provider'] === 'openai' && preg_match('/embed|tts|whisper|dall-e|moderation|transcribe|realtime|audio|image|search/i', $id))) continue;
                $models[] = ['id' => $id, 'name' => $id];
            }
            usort($models, fn ($a, $b) => strcmp($a['id'], $b['id']));
            return $models;
    }
    throw new AiException('Choose an AI provider.');
}

/** @param array{provider:string, model:string, key:string, baseUrl?:string} $config */
function ai_complete(array $config, string $system, string $prompt, ?callable $http = null): string
{
    $http ??= 'ai_http';
    $key = $config['key'];
    $model = ai_model_id($config['model']);
    $json = fn (array $value) => json_encode($value, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
    switch ($config['provider']) {
        case 'anthropic':
            $body = ['model' => $model, 'max_tokens' => 16000, 'system' => $system, 'messages' => [['role' => 'user', 'content' => $prompt]]];
            $headers = ai_anthropic_headers($key);
            if (in_array($model, AI_ANTHROPIC_FALLBACK_MODELS, true)) {
                $body['fallbacks'] = 'default';
                $headers[] = 'anthropic-beta: server-side-fallback-2026-07-01';
            }
            $data = ai_call($http, 'POST', 'https://api.anthropic.com/v1/messages', $headers, $json($body), $key);
            if (($data['stop_reason'] ?? '') === 'refusal') throw new AiException('The model declined to summarize these emails.');
            $text = implode("\n", array_map(fn ($block) => (string) $block['text'], array_filter($data['content'] ?? [], fn ($block) => ($block['type'] ?? '') === 'text')));
            break;
        case 'gemini':
            $body = ['systemInstruction' => ['parts' => [['text' => $system]]], 'contents' => [['role' => 'user', 'parts' => [['text' => $prompt]]]]];
            $data = ai_call($http, 'POST', 'https://generativelanguage.googleapis.com/v1beta/models/' . rawurlencode($model) . ':generateContent', ['x-goog-api-key: ' . $key], $json($body), $key);
            if (!empty($data['promptFeedback']['blockReason'])) throw new AiException('The model declined to summarize these emails.');
            $text = implode('', array_map(fn ($part) => (string) ($part['text'] ?? ''), $data['candidates'][0]['content']['parts'] ?? []));
            break;
        case 'openai':
        case 'openai_compatible':
            $base = $config['provider'] === 'openai' ? 'https://api.openai.com/v1' : ai_base_url($config['baseUrl'] ?? '');
            $body = ['model' => $model, 'messages' => [['role' => 'system', 'content' => $system], ['role' => 'user', 'content' => $prompt]]];
            $data = ai_call($http, 'POST', $base . '/chat/completions', $key !== '' ? ['Authorization: Bearer ' . $key] : [], $json($body), $key);
            $text = (string) ($data['choices'][0]['message']['content'] ?? '');
            break;
        default:
            throw new AiException('Choose an AI provider.');
    }
    $text = trim($text);
    if ($text === '') throw new AiException('The AI provider returned an empty summary. Try again or choose another model.');
    return $text;
}

function ai_anthropic_headers(string $key): array
{
    return ['x-api-key: ' . $key, 'anthropic-version: 2023-06-01'];
}

/** Calls the provider and maps failures to messages that never repeat the key. */
function ai_call(callable $http, string $method, string $url, array $headers, ?string $body, string $key): array
{
    $response = $http($method, $url, $headers, $body);
    $data = json_decode($response['body'], true);
    if ($response['status'] >= 200 && $response['status'] < 300 && is_array($data)) return $data;
    $detail = is_array($data) ? ($data['error']['message'] ?? (is_string($data['error'] ?? null) ? $data['error'] : '')) : '';
    $detail = mb_substr(trim(str_replace($key !== '' ? $key : "\0", '[key]', (string) $detail)), 0, 200);
    $message = match (true) {
        in_array($response['status'], [401, 403], true) => 'The AI provider rejected the API key.',
        $response['status'] === 404 => 'The AI provider could not find that model.',
        $response['status'] === 429 => 'The AI provider is rate limiting this key or it is out of credit. Try again later.',
        default => 'The AI provider returned an error (HTTP ' . $response['status'] . ').',
    };
    throw new AiException($message . ($detail !== '' ? ' ' . $detail : ''));
}
