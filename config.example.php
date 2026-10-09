<?php

// Copy this file to config.php, then replace every example value locally.
return [
    'db_host' => '127.0.0.1',
    'db_port' => 3306,
    'db_name' => 'your_database_name',
    'db_user' => 'your_database_user',
    'db_password' => 'your_database_password',
    'username' => 'your_app_username',
    'password' => 'your_app_password',
    'api_token' => 'replace-with-a-long-random-token',
    'api_allow_secret_notes' => false,
    // true only behind a TLS-terminating reverse proxy you control.
    'trust_proxy' => false,
];
