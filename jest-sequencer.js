const Sequencer = require('@jest/test-sequencer').default;

/**
 * Ensures tests/zzz-teardown.test.js runs last so it can close the shared pg pool
 * and Socket.io server before the process exits.
 */
class CustomSequencer extends Sequencer {
  sort(tests) {
    const copy = Array.from(tests);
    return copy.sort((a, b) => {
      const aTeardown = a.path.includes('zzz-teardown');
      const bTeardown = b.path.includes('zzz-teardown');
      if (aTeardown && !bTeardown) return 1;
      if (!aTeardown && bTeardown) return -1;
      return a.path.localeCompare(b.path);
    });
  }
}

module.exports = CustomSequencer;
