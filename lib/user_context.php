<?php
declare(strict_types=1);

/** Request identity is assigned only after session or bearer authentication. */
function life_os_user_id(): int
{
    $id = $GLOBALS['life_os_request_user_id'] ?? null;
    if ($id === null && PHP_SAPI === 'cli') return 1;
    if (!is_int($id) || $id < 1) throw new RuntimeException('Authenticated user context is required.');
    return $id;
}
