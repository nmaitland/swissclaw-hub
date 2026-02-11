/**
 * Runs last (via jest-sequencer.js) so that the shared pg pool and Socket.io server
 * from server/index.js are closed after all tests. This releases DB connections and
 * io handles promptly. We still use --forceExit because other server globals (e.g.
 * express-rate-limit or pg internals) can keep the Node process alive; the teardown
 * ensures we at least close the pool and io.
 */
const { pool, io } = require('../server/index');

describe('teardown', () => {
  afterAll(async () => {
    if (io) {
      await new Promise((resolve) => {
        io.close(() => resolve());
      });
    }
    try {
      if (pool) await pool.end();
    } catch (err) {
      // Pool may already be closed; ignore
    }
  });

  it('ensures teardown suite runs', () => {});
});
