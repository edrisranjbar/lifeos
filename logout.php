<?php

require_once __DIR__ . '/auth.php';
life_os_logout();
header('Location: /login.php');
exit;
