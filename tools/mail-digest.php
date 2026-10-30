<?php

declare(strict_types=1);

// Writes today's email summary for every account that has an AI model set up, so it is
// ready before the Overview is opened. Optional: without it, the first visit writes it.
// Example cron entry (07:00 every day):  0 7 * * * php /path/to/lifeos/tools/mail-digest.php
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }

require_once dirname(__DIR__) . '/db.php';
require_once dirname(__DIR__) . '/lib/mail.php';

$db = life_os_db();
$users = $db->query("SELECT m.user_id FROM mail_accounts m JOIN app_users u ON u.id = m.user_id WHERE u.active = 1 AND m.ai_provider <> '' AND m.ai_model <> ''")->fetchAll(PDO::FETCH_COLUMN);
$failed = 0;
foreach ($users as $userId) {
    $GLOBALS['life_os_request_user_id'] = (int) $userId;
    if (mail_digest($db) !== null) { echo "account $userId: already summarized today\n"; continue; }
    try {
        $digest = mail_generate_digest($db, mail_account($db));
        echo "account $userId: summarized {$digest['count']} email(s)\n";
    } catch (ApiException $error) {
        $failed++;
        echo "account $userId: {$error->getMessage()}\n";
    }
}
exit($failed ? 1 : 0);
