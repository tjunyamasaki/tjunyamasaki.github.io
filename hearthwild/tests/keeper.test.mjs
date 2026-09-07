import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import { createKeeperRig } from '../render/keeper.js';
import { gatherPose, idleHoePose } from '../render/gathering.mjs';

function rigFixture() {
  return createKeeperRig(T, {
    geometries: { stone: new T.IcosahedronGeometry(1), cube: new T.BoxGeometry(),
      cone: new T.ConeGeometry(1, 1), cylinder: new T.CylinderGeometry(1, 1, 1), ring: new T.RingGeometry() },
    registry: { meshMaterial: color => new T.MeshStandardMaterial({ color }),
      basicMaterial: color => new T.MeshBasicMaterial({ color }), registerLight() {} },
    trackGeo: geometry => geometry, glow() {},
    mesh(geometry, material, parent, x=0, y=0, z=0, sx=1, sy=1, sz=1) {
      const object = new T.Mesh(geometry, material);
      object.position.set(x,y,z); object.scale.set(sx,sy,sz); parent.add(object); return object;
    },
  });
}

test('rendered axe edge and pick point lead the stroke for both equipment tiers', () => {
  const rig = rigFixture();
  for (const style of ['chop', 'mine']) for (const copper of [false, true]) {
    const equipment = { stoneAxe:true, stonePick:true, copperAxe:copper, copperPick:copper };
    const head = rig.root.getObjectByName(`${style === 'chop' ? 'axe' : 'pick'}-${copper ? 'copper' : 'stone'}-head`);
    const point = style === 'chop' ? new T.Vector3(.36,.65,0) : new T.Vector3(.44,.532,0);
    const sample = progress => {
      rig.apply({ pose:{ x:0,z:0,facing:0 }, gather:gatherPose({ progress,style,equipment }), moving:false, reduced:false,time:0,dt:1/60 });
      rig.root.updateMatrixWorld(true);
      return head.localToWorld(point.clone());
    };
    const before = sample(.40), contact = sample(.42);
    const travel = contact.clone().sub(before).normalize();
    const edgeDirection = new T.Vector3(1,0,0).transformDirection(head.matrixWorld);
    assert.ok(edgeDirection.dot(travel) > .65, `${style}: working end must lead, not travel sideways`);
    assert.ok(contact.y > .15 && contact.y < .8, `${style}: contact stays above ground at working height`);
    assert.ok(contact.z > .55 && contact.z < 1.3, `${style}: contact reaches forward`);
    assert.equal(head.visible, true);
  }
});

test('hoe lip leads the downward scrape for cloak and brim keepers', () => {
  const equipment = { hoe: true, stoneAxe: true, stonePick: true };
  const lip = new T.Vector3(0, 0.18, 0.02);
  const edgeLocal = new T.Vector3(0, 1, 0);
  for (const variant of ['cloak', 'brim']) {
    const rig = rigFixture();
    const head = rig.root.getObjectByName('hoe-head');
    const sample = progress => {
      rig.apply({
        pose: { x: 0, z: 0, facing: 0 },
        gather: gatherPose({ progress, style: 'till', equipment }),
        moving: false, reduced: false, time: 0, dt: 1, variant,
      });
      rig.root.updateMatrixWorld(true);
      return head.localToWorld(lip.clone());
    };
    for (const [from, to] of [[0.5, 0.58], [0.62, 0.7]]) {
      const before = sample(from);
      const contact = sample(to);
      const travel = contact.clone().sub(before);
      const length = travel.length();
      assert.ok(length > 0.04, `${variant} ${from}->${to}: blade must move`);
      travel.multiplyScalar(1 / length);
      const edge = edgeLocal.clone().transformDirection(head.matrixWorld);
      assert.ok(edge.dot(travel) > 0.55, `${variant} ${from}->${to}: hoe lip must lead scrape, not sit sideways`);
    }
    const contact = sample(0.7);
    assert.ok(contact.y > 0.02 && contact.y < 0.42, `${variant}: scrape stays near the earth`);
    assert.ok(contact.z > 0.45 && contact.z < 1.35, `${variant}: scrape reaches forward`);
    assert.equal(head.visible, true);
    assert.equal(rig.root.getObjectByName('hoe').visible, true);
    assert.equal(rig.root.getObjectByName('axe').visible, false);
    assert.equal(rig.root.getObjectByName('pick').visible, false);
  }
});

test('idle hoe hold puts both hands on the shaft for each keeper variant', () => {
  for (const variant of ['cloak', 'brim']) {
    const rig = rigFixture();
    rig.apply({
      pose: { x: 0, z: 0, facing: 0 },
      gather: idleHoePose(),
      moving: false, reduced: false, time: 0, dt: 1, variant,
    });
    rig.root.updateMatrixWorld(true);
    const hoe = rig.root.getObjectByName('hoe');
    const head = rig.root.getObjectByName('hoe-head');
    const left = rig.root.getObjectByName('hand-left');
    const right = rig.root.getObjectByName('hand-right');
    assert.equal(hoe.visible, true);
    assert.equal(head.visible, true);
    const span = left.position.distanceTo(right.position);
    assert.ok(span > 0.22 && span < 0.55, `${variant}: hands must grip separate shaft points (span=${span})`);
    const blade = head.children[0];
    blade.geometry.computeBoundingBox();
    const size = blade.geometry.boundingBox.getSize(new T.Vector3());
    assert.ok(size.x > 0.22 && size.x < 0.32, `${variant}: blade is broad, not a pick point`);
    assert.ok(size.y > 0.16 && size.y < 0.26, `${variant}: blade has earth-working depth`);
  }
});

test('plant pose reaches earth with empty hands on cloak and brim keepers', () => {
  const equipment = { hoe: true, stoneAxe: true, stonePick: true };
  for (const variant of ['cloak', 'brim']) {
    const rig = rigFixture();
    const sample = progress => {
      rig.apply({
        pose: { x: 0, z: 0, facing: 0 },
        gather: gatherPose({ progress, style: 'plant', kind: 'carrot', equipment }),
        moving: false, reduced: false, time: 0, dt: 1, variant,
      });
      rig.root.updateMatrixWorld(true);
    };
    sample(0.45);
    const left = rig.root.getObjectByName('hand-left');
    const right = rig.root.getObjectByName('hand-right');
    assert.equal(rig.root.getObjectByName('hoe').visible, false, `${variant}: hoe stays out of the planting hand`);
    assert.equal(rig.root.getObjectByName('axe').visible, false);
    assert.equal(rig.root.getObjectByName('pick').visible, false);
    assert.ok(right.position.y < 0.22, `${variant}: near hand reaches earth (y=${right.position.y})`);
    assert.ok(left.position.y > right.position.y + 0.04, `${variant}: other hand stays in support`);
    assert.ok(right.position.z > left.position.z, `${variant}: planting hand is the forward hand`);
    assert.ok(rig.lantern.position.x < 0, `${variant}: lantern sits at the belt`);
    const reachY = right.position.y;
    sample(0.05);
    assert.ok(right.position.y > reachY + 0.08, `${variant}: kneel starts higher than the earth reach`);
  }
});

test('harvest tug grips leaves then lifts on cloak and brim keepers', () => {
  const equipment = { hoe: true, stoneAxe: true, stonePick: true };
  for (const variant of ['cloak', 'brim']) {
    const rig = rigFixture();
    const sample = progress => {
      rig.apply({
        pose: { x: 0, z: 0, facing: 0 },
        gather: gatherPose({ progress, style: 'tug', kind: 'carrot', equipment }),
        moving: false, reduced: false, time: 0, dt: 1, variant,
      });
      rig.root.updateMatrixWorld(true);
    };
    sample(0.4);
    const left = rig.root.getObjectByName('hand-left');
    const right = rig.root.getObjectByName('hand-right');
    assert.equal(rig.root.getObjectByName('hoe').visible, false, `${variant}: hoe stays out of the harvest hands`);
    assert.equal(rig.root.getObjectByName('axe').visible, false);
    assert.equal(rig.root.getObjectByName('pick').visible, false);
    assert.ok(right.position.y < 0.32, `${variant}: hands grip leaves (y=${right.position.y})`);
    assert.ok(Math.abs(left.position.y - right.position.y) < 0.12, `${variant}: both hands meet at the foliage`);
    assert.ok(right.position.z > 0.2 && left.position.z > 0.2, `${variant}: grip reaches forward`);
    assert.ok(rig.lantern.position.x < 0, `${variant}: lantern sits at the belt`);
    const gripY = right.position.y;
    sample(0.12);
    assert.ok(right.position.y > gripY + 0.08, `${variant}: approach starts higher than the leaf grip`);
    sample(0.78);
    assert.ok(right.position.y > gripY + 0.12, `${variant}: tug lifts the hands (y=${right.position.y})`);
    assert.equal(rig.root.getObjectByName('hoe').visible, false);
  }
});

test('uproot pull stays smaller than harvest on cloak and brim keepers', () => {
  const equipment = { hoe: true, stoneAxe: true, stonePick: true };
  for (const variant of ['cloak', 'brim']) {
    const rig = rigFixture();
    const sample = (style, progress) => {
      rig.apply({
        pose: { x: 0, z: 0, facing: 0 },
        gather: gatherPose({ progress, style, kind: 'carrot', equipment }),
        moving: false, reduced: false, time: 0, dt: 1, variant,
      });
      rig.root.updateMatrixWorld(true);
      return rig.root.getObjectByName('hand-right').position.y;
    };
    const grip = sample('uproot', 0.45);
    const approach = sample('uproot', 0.08);
    const harvestLift = sample('tug', 0.78);
    assert.ok(grip < approach - 0.06, `${variant}: uproot reaches down (grip=${grip}, approach=${approach})`);
    assert.ok(harvestLift > grip + 0.1, `${variant}: harvest lift is taller than uproot`);
    sample('uproot', 0.45);
    assert.equal(rig.root.getObjectByName('hoe').visible, false, `${variant}: hoe stays out of the uproot hands`);
    assert.equal(rig.root.getObjectByName('axe').visible, false);
    assert.equal(rig.root.getObjectByName('pick').visible, false);
    assert.ok(rig.lantern.position.x < 0, `${variant}: lantern sits at the belt`);
  }
});

test('smooth rake keeps the hoe lip near earth on cloak and brim keepers', () => {
  const equipment = { hoe: true, stoneAxe: true, stonePick: true };
  const lip = new T.Vector3(0, 0.18, 0.02);
  for (const variant of ['cloak', 'brim']) {
    const rig = rigFixture();
    const head = rig.root.getObjectByName('hoe-head');
    const sample = progress => {
      rig.apply({
        pose: { x: 0, z: 0, facing: 0 },
        gather: gatherPose({ progress, style: 'rake', equipment }),
        moving: false, reduced: false, time: 0, dt: 1, variant,
      });
      rig.root.updateMatrixWorld(true);
      return head.localToWorld(lip.clone());
    };
    const lifted = sample(0.38);
    const leveled = sample(0.7);
    assert.ok(lifted.y > leveled.y + 0.02, `${variant}: rake lowers the blade to level (lift=${lifted.y}, level=${leveled.y})`);
    assert.ok(leveled.y > 0.02 && leveled.y < 0.48, `${variant}: level stroke stays near the earth`);
    assert.ok(leveled.z > 0.35, `${variant}: rake reaches forward`);
    assert.equal(rig.root.getObjectByName('hoe').visible, true);
    assert.equal(rig.root.getObjectByName('axe').visible, false);
    assert.equal(rig.root.getObjectByName('pick').visible, false);
    assert.ok(rig.lantern.position.x < 0, `${variant}: lantern sits at the belt`);
  }
});
