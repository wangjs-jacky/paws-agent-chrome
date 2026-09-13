import { describe, expect, it } from 'vitest';
import { sessionWebUrl } from '../src/sessionLink';

describe('session web navigation', () => {
    it.each([
        ['https://47.115.228.20:8443', 'session-123', 'https://47.115.228.20:8443/session/session-123'],
        ['https://paws.example/team/?token=private#settings', 'id/with?#', 'https://paws.example/team/session/id%2Fwith%3F%23'],
        ['http://localhost:3000/', 'local-id', 'http://localhost:3000/session/local-id'],
    ])('builds a session route without query credentials from %s', (server, id, expected) => {
        expect(sessionWebUrl(server, id)).toBe(expected);
    });

    it.each([
        ['https://paws.example', ''],
        ['https://paws.example', '..'],
        ['javascript:alert(1)', 'session-id'],
        ['not a URL', 'session-id'],
        ['https://user:password@paws.example', 'session-id'],
    ])('does not expose an unsafe or absent navigation target (%s, %s)', (server, id) => {
        expect(sessionWebUrl(server, id)).toBeNull();
    });
});
