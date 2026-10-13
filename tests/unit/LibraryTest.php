<?php
declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once dirname(__DIR__, 2) . '/lib/state_store.php';
require_once dirname(__DIR__, 2) . '/lib/http_cache.php';

final class LibraryTest extends TestCase
{
    public function testStateMutationRollsBackEveryDocumentOnFailure(): void
    {
        $db = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $db->exec('CREATE TABLE app_state (user_id INTEGER NOT NULL DEFAULT 1, state_key TEXT NOT NULL, state_value TEXT NOT NULL, PRIMARY KEY (user_id, state_key))');
        $db->exec("INSERT INTO app_state (state_key, state_value) VALUES ('a', '{\"value\":1}')");
        $store = new StateStore($db);
        try {
            $store->mutate(['a' => [], 'b' => []], function (array &$documents) {
                $documents['a']['value'] = 99;
                $documents['b'] = ['created' => true];
                throw new RuntimeException('Abort');
            });
            self::fail('Mutation should fail');
        } catch (RuntimeException $error) { self::assertSame('Abort', $error->getMessage()); }
        self::assertSame(['value' => 1], $store->get('a', []));
        self::assertNull($store->raw('b'));
        self::assertFalse($db->inTransaction());
    }

    public function testStaleRevisionCannotOverwriteSavedState(): void
    {
        $db = new PDO('sqlite::memory:', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $db->exec('CREATE TABLE app_state (user_id INTEGER NOT NULL DEFAULT 1, state_key TEXT NOT NULL, state_value TEXT NOT NULL, PRIMARY KEY (user_id, state_key))');
        $store = new StateStore($db);
        $revision = $store->compareAndSwap('a', '{"value":1}', null);
        $store->compareAndSwap('a', '{"value":2}', $revision);
        try { $store->compareAndSwap('a', '{"value":3}', $revision); self::fail('Expected conflict'); }
        catch (ApiException $error) { self::assertSame(409, $error->status); }
        self::assertSame(['value' => 2], $store->get('a', []));
    }

    public function testCachePolicySeparatesDocumentsAndVersionedAssets(): void
    {
        self::assertSame('private, no-store', life_os_static_cache('html', ['v' => '1']));
        self::assertSame('private, max-age=31536000, immutable', life_os_static_cache('js', ['v' => '1']));
        self::assertSame('private, max-age=3600', life_os_static_cache('css', []));
        self::assertSame('private, max-age=3600', life_os_static_cache('css', ['v' => ['1']]));
    }

    public function testInvalidCalendarDateIsRejected(): void
    {
        self::assertSame('2024-02-29', api_date('2024-02-29', 'date'));
        $this->expectException(ApiException::class);
        api_date('2025-02-29', 'date');
    }

    public function testConfiguredTimezoneAndCoordinates(): void
    {
        try {
            putenv('LIFEOS_TIMEZONE=Pacific/Kiritimati');
            putenv('LIFEOS_WEATHER_LATITUDE=-33.9');
            putenv('LIFEOS_WEATHER_LONGITUDE=151.2');
            self::assertSame((new DateTimeImmutable('now', new DateTimeZone('Pacific/Kiritimati')))->format('Y-m-d'), api_today());
            self::assertSame(['latitude' => -33.9, 'longitude' => 151.2], life_os_weather_coordinates());
            putenv('LIFEOS_WEATHER_LATITUDE=91');
            $this->expectException(RuntimeException::class);
            life_os_weather_coordinates();
        } finally {
            putenv('LIFEOS_TIMEZONE'); putenv('LIFEOS_WEATHER_LATITUDE'); putenv('LIFEOS_WEATHER_LONGITUDE');
        }
    }
}
