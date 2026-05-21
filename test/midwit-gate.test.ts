import test from "node:test";
import assert from "node:assert/strict";

import { getProjectGateDefaults } from "../extensions/midwit-gate.ts";

test("midwit gate is off by default when project config does not opt in", () => {
	assert.deepEqual(getProjectGateDefaults(undefined), { enabled: false, mode: "initial" });
	assert.deepEqual(getProjectGateDefaults({}), { enabled: false, mode: "initial" });
});

test("project config can explicitly enable midwit gate", () => {
	assert.deepEqual(getProjectGateDefaults({ gate: { enabled: true } }), { enabled: true, mode: "initial" });
	assert.deepEqual(getProjectGateDefaults({ gate: { enabled: true, mode: "all" } }), { enabled: true, mode: "all" });
});

test("project config can explicitly keep midwit gate off", () => {
	assert.deepEqual(getProjectGateDefaults({ gate: { enabled: false } }), { enabled: false, mode: "initial" });
	assert.deepEqual(getProjectGateDefaults({ gate: { enabled: false, mode: "all" } }), { enabled: false, mode: "all" });
});
