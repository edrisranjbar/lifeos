<?php

declare(strict_types=1);

require_once __DIR__ . '/lib/api_response.php';
require_once __DIR__ . '/lib/user_context.php';

function api_configured_token(array $config): string
{
    $environment = getenv('LIFEOS_API_TOKEN');
    return $environment !== false ? $environment : (string) ($config['api_token'] ?? '');
}

function api_token_valid(string $authorization, string $expected): bool
{
    // Fail closed when the token is unset or still the documented placeholder.
    if (strlen($expected) < 32 || $expected === 'replace-with-a-long-random-token') return false;
    return preg_match('/^Bearer ([^\s]+)$/iD', $authorization, $match) === 1 && hash_equals($expected, $match[1]);
}

function api_require_auth(array $config): void
{
    $header = (string) ($_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
    if (!api_token_valid($header, api_configured_token($config))) {
        header('WWW-Authenticate: Bearer realm="LifeOS"');
        throw new ApiException(401, 'unauthorized', 'A valid API bearer token is required.');
    }
    // The operator token belongs to one account, never to every user's records.
    $id = filter_var($config['api_user_id'] ?? 1, FILTER_VALIDATE_INT, ['options'=>['min_range'=>1]]);
    if ($id === false) throw new ApiException(401, 'unauthorized', 'The API account is unavailable.');
    $query = life_os_db()->prepare('SELECT id FROM app_users WHERE id = ? AND active = 1');
    $query->execute([$id]);
    if (!$query->fetchColumn()) throw new ApiException(401, 'unauthorized', 'The API account is unavailable.');
    $GLOBALS['life_os_request_user_id'] = $id;
}
