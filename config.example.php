<?php

// Copy this file to config.php, then replace every example value locally.
return [
    'db_host' => '127.0.0.1',
    'db_port' => 3306,
    'db_name' => 'your_database_name',
    'db_user' => 'your_database_user',
    'db_password' => 'your_database_password',
    // First-run sign-in only. Both may be removed once app_credentials is seeded.
    'username' => 'your_app_username',
    'password' => 'your_app_password',
    'api_token' => 'replace-with-a-long-random-token',
    // The operator API/MCP token can access only this active account's data.
    'api_user_id' => 1,
    'api_allow_secret_notes' => false,
    // Optional: encrypts saved mail app passwords and AI keys. Empty = generated key file
    // kept beside the attachment files, outside the web root.
    'secret_key' => '',
    'timezone' => 'Asia/Tehran',
    'weather_latitude' => 26.9492,
    'weather_longitude' => 56.2691,
    'weather_location' => 'Qeshm',
    // true only behind a TLS-terminating reverse proxy you control.
    'trust_proxy' => false,
];
