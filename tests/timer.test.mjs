import { test } from 'node:test';
import assert from 'node:assert/strict';
import { remainingSeconds, nextMode } from '../public_html/assets/timer.mjs';
test('elapsed time remains accurate after background throttling',()=>{assert.equal(remainingSeconds({deadline:1500000,remaining:1500},1499001),1);assert.equal(remainingSeconds({deadline:1500000,remaining:1500},1800000),0)});
test('paused timer does not advance',()=>assert.equal(remainingSeconds({deadline:null,remaining:600},99999999),600));
test('long break follows every fourth completed focus',()=>{assert.equal(nextMode('focus',3),'short');assert.equal(nextMode('focus',4),'long');assert.equal(nextMode('long',4),'focus');assert.equal(nextMode('focus',0),'short')});
