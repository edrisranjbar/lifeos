<?php

declare(strict_types=1);

require_once __DIR__ . '/user_context.php';

require_once __DIR__ . '/api_response.php';

final class StateStore
{
    public function __construct(private PDO $db) {}

    public function raw(string $key): ?string
    {
        $query = $this->db->prepare('SELECT state_value FROM app_state WHERE user_id = ' . life_os_user_id() . ' AND state_key = ?');
        $query->execute([$key]);
        $value = $query->fetchColumn();
        return $value === false ? null : (string) $value;
    }

    public function get(string $key, array $default): array
    {
        return $this->decode($this->raw($key), $default);
    }

    public function compareAndSwap(string $key, string $value, ?string $revision): string
    {
        $this->db->beginTransaction();
        try {
            $mysql = $this->db->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql';
            // Reserve missing rows too. The placeholder is rolled back on conflict.
            $insert = $this->db->prepare($mysql ? 'INSERT INTO app_state (user_id, state_key, state_value) VALUES (' . life_os_user_id() . ', ?, ?) ON DUPLICATE KEY UPDATE state_key = VALUES(state_key)' : 'INSERT OR IGNORE INTO app_state (user_id, state_key, state_value) VALUES (' . life_os_user_id() . ', ?, ?)');
            $insert->execute([$key, '']);
            $created = $insert->rowCount() === 1;
            $select = $this->db->prepare('SELECT state_value FROM app_state WHERE user_id = ' . life_os_user_id() . ' AND state_key = ?' . ($mysql ? ' FOR UPDATE' : ''));
            $select->execute([$key]);
            $current = (string) $select->fetchColumn();
            $actual = $created ? null : hash('sha256', $current);
            if ($actual !== $revision) throw new ApiException(409, 'state_conflict', 'Saved data changed elsewhere. Reload before editing again.');
            $write = $this->db->prepare('UPDATE app_state SET state_value = ? WHERE user_id = ' . life_os_user_id() . ' AND state_key = ?');
            $write->execute([$value, $key]);
            $this->db->commit();
            return hash('sha256', $value);
        } catch (Throwable $error) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            throw $error;
        }
    }

    private function decode(?string $raw, array $default): array
    {
        if ($raw === null) return $default;
        $original = json_decode($raw, false, 64, JSON_THROW_ON_ERROR);
        $decoded = $original instanceof stdClass ? array_map('state_decode_value', get_object_vars($original)) : state_decode_value($original);
        if (!is_array($decoded)) throw new RuntimeException('Invalid stored document shape.');
        return $decoded;
    }

    /** Lock all documents in key order, including missing rows, before mutating. */
    public function mutate(array $defaults, callable $mutator, ?array $expectedRevisions = null): mixed
    {
        ksort($defaults);
        $this->db->beginTransaction();
        try {
            $mysql = $this->db->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql';
            $insert = $this->db->prepare($mysql
                ? 'INSERT INTO app_state (user_id, state_key, state_value) VALUES (' . life_os_user_id() . ', ?, ?) ON DUPLICATE KEY UPDATE state_key = VALUES(state_key)'
                : 'INSERT OR IGNORE INTO app_state (user_id, state_key, state_value) VALUES (' . life_os_user_id() . ', ?, ?)');
            $select = $this->db->prepare('SELECT state_value FROM app_state WHERE user_id = ' . life_os_user_id() . ' AND state_key = ?' . ($mysql ? ' FOR UPDATE' : ''));
            $documents = [];
            $originals = [];
            $initial = [];
            $created = [];
            foreach ($defaults as $key => $default) {
                $insert->execute([$key, json_encode($default, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR)]);
                $created[$key] = $insert->rowCount() === 1;
                $select->execute([$key]);
                $raw = (string) $select->fetchColumn();
                if ($expectedRevisions !== null) {
                    $actual = $created[$key] ? null : hash('sha256', $raw);
                    if (!array_key_exists($key, $expectedRevisions) || $expectedRevisions[$key] !== $actual) throw new ApiException(409, 'state_conflict', 'Saved data changed elsewhere. Refresh before editing.');
                }
                $documents[$key] = $this->decode($raw, $default);
                $initial[$key] = $documents[$key];
                $originals[$key] = json_decode($raw, false, 64, JSON_THROW_ON_ERROR);
            }
            $result = $mutator($documents);
            $write = $this->db->prepare('UPDATE app_state SET state_value = ? WHERE user_id = ' . life_os_user_id() . ' AND state_key = ?');
            foreach ($documents as $key => $value) {
                if ($value === $initial[$key]) {
                    if ($created[$key]) {
                        $delete = $this->db->prepare('DELETE FROM app_state WHERE user_id = ' . life_os_user_id() . ' AND state_key = ?');
                        $delete->execute([$key]);
                    }
                    continue;
                }
                $json = json_encode(state_preserve_containers($value, $originals[$key]), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION | JSON_THROW_ON_ERROR);
                if (strlen($json) > 2_000_000) throw new ApiException(413, 'state_too_large', 'Document exceeds 2 MB.');
                $write->execute([$json, $key]);
            }
            $this->db->commit();
            return $result;
        } catch (Throwable $error) {
            if ($this->db->inTransaction()) $this->db->rollBack();
            throw $error;
        }
    }
}

/** Preserve object/list distinctions in unknown frontend metadata, including {}. */
function state_preserve_containers(mixed $value, mixed $original): mixed
{
    if (!is_array($value)) return $value;
    $output = [];
    foreach ($value as $key => $item) {
        $old = $original instanceof stdClass ? ($original->{(string) $key} ?? null) : (is_array($original) ? ($original[$key] ?? null) : null);
        $output[$key] = state_preserve_containers($item, $old);
    }
    return $original instanceof stdClass ? (object) $output : $output;
}

function state_decode_value(mixed $value): mixed
{
    if ($value instanceof stdClass) {
        $properties = array_map('state_decode_value', get_object_vars($value));
        // Keep opaque empty/numeric-key objects as objects even when cards move.
        return !$properties || array_is_list($properties) ? (object) $properties : $properties;
    }
    return is_array($value) ? array_map('state_decode_value', $value) : $value;
}

function get_state_json(string $key, array $default): array
{
    return (new StateStore(life_os_db()))->get($key, $default);
}

function update_state_json(string $key, callable $mutator, array $default = []): mixed
{
    return (new StateStore(life_os_db()))->mutate([$key => $default], function (array &$documents) use ($key, $mutator) {
        return $mutator($documents[$key]);
    });
}

function save_state_json(string $key, array $value): void
{
    update_state_json($key, function (array &$document) use ($value): void { $document = $value; });
}
