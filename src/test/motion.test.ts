import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { stepTowardTarget } from '../common/motion';

describe('desktop motion', () => {
  it('moves toward a 2D target using pixel speed', () => {
    const result = stepTowardTarget(0, 0, 1, 1, 1, 100, 0.1, 1000, 500);

    assert.equal(result.arrived, false);
    assert.equal(result.direction, 1);
    assert.ok(result.x > 0);
    assert.ok(result.y > 0);
    assert.ok(result.x < 1);
    assert.ok(result.y < 1);
  });

  it('arrives without overshooting', () => {
    const result = stepTowardTarget(
      0.49,
      0.49,
      0.5,
      0.5,
      -1,
      100,
      0.1,
      100,
      100,
    );

    assert.deepEqual(result, {
      x: 0.5,
      y: 0.5,
      arrived: true,
      direction: 1,
    });
  });

  it('clamps invalid normalized positions', () => {
    const result = stepTowardTarget(-2, 4, 0.5, 0.5, -1, 0, 1, 100, 100);

    assert.deepEqual(result, {
      x: 0,
      y: 1,
      arrived: false,
      direction: -1,
    });
  });
});
