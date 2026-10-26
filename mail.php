<?php

declare(strict_types=1);

require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/lib/mail.php';
life_os_require_auth();

header('Cache-Control: private, no-store');
try {
    $db = life_os_db();
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    api_method(['GET', 'POST'], $method);
    if ($method === 'GET') {
        $view = (string) ($_GET['view'] ?? 'settings');
        $account = mail_account($db);
        if ($view === 'settings') api_json(mail_settings_view($account));
        if ($account === null) throw new ApiException(404, 'mail_not_connected', 'Connect your email in Settings.');
        if ($view === 'inbox') {
            set_time_limit(90);
            api_json(mail_inbox($db, $account, ($_GET['refresh'] ?? '') === '1'));
        }
        if ($view === 'digest') api_json(['digest' => mail_digest($db), 'aiReady' => $account['ai_provider'] !== '' && $account['ai_model'] !== '']);
        throw new ApiException(404, 'not_found', 'Unknown view.');
    }

    life_os_require_csrf(fn () => throw new ApiException(403, 'invalid_request_token', 'Invalid request token. Reload and try again.'));
    $body = api_body();
    $action = (string) ($body['action'] ?? '');
    if ($action === 'save') {
        set_time_limit(90);
        api_json(mail_save_settings($db, $body));
    }
    if ($action === 'disconnect') api_json(mail_disconnect($db));
    if ($action === 'models') {
        api_fields($body, ['action', 'ai_provider', 'ai_base_url', 'ai_key']);
        $provider = (string) ($body['ai_provider'] ?? '');
        $key = (string) ($body['ai_key'] ?? '');
        $account = mail_account($db);
        // A blank key means "use the one already saved for this provider".
        if ($key === '' && $account !== null && $account['ai_provider'] === $provider) $key = mail_ai_config($account)['key'] ?? '';
        if ($key === '' && $provider !== 'openai_compatible') throw new ApiException(422, 'validation_error', 'Enter the API key first.');
        try {
            api_json(['models' => ai_list_models(['provider' => $provider, 'key' => $key, 'baseUrl' => (string) ($body['ai_base_url'] ?? '')])]);
        } catch (AiException $error) {
            throw new ApiException(502, 'mail_ai_failed', $error->getMessage());
        }
    }
    if ($action === 'digest') {
        $account = mail_account($db);
        if ($account === null) throw new ApiException(404, 'mail_not_connected', 'Connect your email in Settings.');
        set_time_limit(240);
        api_json(['digest' => mail_generate_digest($db, $account), 'aiReady' => true]);
    }
    throw new ApiException(422, 'validation_error', 'Unknown action.');
} catch (ApiException $error) {
    api_error($error->status, $error->errorCode, $error->getMessage());
} catch (Throwable $error) {
    error_log('LifeOS mail: ' . get_class($error));
    api_error(503, 'mail_failed', 'Email is unavailable right now. Please try again.');
}
