import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getOnlineStatus, subscribeOnlineStatus, _resetNetworkStatusForTest, _setOnlineForTest } from './networkStatus';

describe('networkStatus', () => {
  beforeEach(() => {
    _resetNetworkStatusForTest(true);
  });

  afterEach(() => {
    _resetNetworkStatusForTest(true);
  });

  it('reports online status correctly', () => {
    expect(getOnlineStatus()).toBe(true);
    _setOnlineForTest(false);
    expect(getOnlineStatus()).toBe(false);
    _setOnlineForTest(true);
    expect(getOnlineStatus()).toBe(true);
  });

  it('notifies subscribers on network transitions', () => {
    const subscriber = vi.fn();
    const unsub = subscribeOnlineStatus(subscriber);

    _setOnlineForTest(false);
    expect(subscriber).toHaveBeenCalledWith(false);

    _setOnlineForTest(true);
    expect(subscriber).toHaveBeenCalledWith(true);

    unsub();
    _setOnlineForTest(false);
    expect(subscriber).toHaveBeenCalledTimes(2);
  });
});
