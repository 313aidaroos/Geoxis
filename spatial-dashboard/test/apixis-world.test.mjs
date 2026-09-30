// 2026-09-29 (Grok, Geoxis Lead): one Apixis ID → one world agent (lib/apixis-world.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { ensureWorldAgent, needsProvision, provisionApixisWorldAgent, worldAgentView, ENTER_URL } from "../lib/apixis-world.js";

const apixisUser = { id: "u1", email: "Person@Example.com", app_metadata: { apixis_sub: "0f0e0d0c-0b0a-4908-8706-050403020100" } };

test("needsProvision: verified user without the stored id only", () => {
  assert.equal(needsProvision(apixisUser), true);
  assert.equal(needsProvision({ id: "u2", email: "a@b.co", email_confirmed_at: "2026-09-29T00:00:00Z" }), true);
  assert.equal(needsProvision({ id: "u3", email: "a@b.co" }), false); // unverified email
  assert.equal(needsProvision({ ...apixisUser, app_metadata: { ...apixisUser.app_metadata, apixis_world_agent_at: "x" } }), false);
});

test("ensureWorldAgent stores the agent id once; a second sign-in never provisions again", async () => {
  let calls = 0;
  const saved = [];
  const deps = {
    provision: async (input) => {
      calls++;
      assert.equal(input.email, "person@example.com");
      assert.equal(input.apixisSub, apixisUser.app_metadata.apixis_sub);
      return { ok: true, created: true, agent: { id: "agent-1", name: "Person" } };
    },
    saveAppMetadata: async (id, m) => saved.push([id, m]),
    now: () => new Date("2026-09-30T02:00:00Z"),
  };
  const first = await ensureWorldAgent(apixisUser, deps);
  assert.equal(first.provisioned, true);
  assert.deepEqual(first.view, { ready: true, id: "agent-1", name: "Person", enterUrl: ENTER_URL });
  assert.equal(saved[0][1].apixis_world_agent_id, "agent-1");
  assert.equal(saved[0][1].apixis_sub, apixisUser.app_metadata.apixis_sub); // keeps existing metadata
  const second = await ensureWorldAgent(first.user, deps);
  assert.equal(second.provisioned, false);
  assert.equal(calls, 1);
  assert.equal(saved.length, 1);
});

test("ensureWorldAgent never throws and leaves the flag unset on failure (retry next time)", async () => {
  const r = await ensureWorldAgent(apixisUser, { provision: async () => ({ ok: false, error: "apixis_world_key_missing" }), saveAppMetadata: async () => { throw new Error("no"); } });
  assert.equal(r.provisioned, false);
  assert.equal(r.view.ready, false);
  const boom = await ensureWorldAgent(apixisUser, { provision: async () => { throw new Error("x"); } });
  assert.equal(boom.error, "provision_error");
});

test("provisionApixisWorldAgent: no key → no network call; request shape matches Apixis.dev", async () => {
  let hit = 0;
  const none = await provisionApixisWorldAgent({ email: "a@b.co" }, { env: {}, fetchImpl: async () => { hit++; } });
  assert.deepEqual(none, { ok: false, error: "apixis_world_key_missing" });
  assert.equal(hit, 0);
  const key = "k".repeat(40);
  const ok = await provisionApixisWorldAgent({ email: "a@b.co", apixisSub: "s" }, {
    env: { APIXIS_WORLD_KEY: key },
    fetchImpl: async (url, init) => {
      assert.equal(url, "https://www.apixis.dev/api/agent/provision");
      assert.equal(init.headers.authorization, `Bearer ${key}`);
      const body = JSON.parse(init.body);
      assert.deepEqual(body, { from: "geoxis", email: "a@b.co", email_verified: true, apixis_sub: "s" });
      return { ok: true, status: 200, json: async () => ({ ok: true, created: false, starter_ixis: 200, agent: { id: "a1" }, enter_url: ENTER_URL }) };
    },
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.created, false);
  assert.equal(ok.agent.id, "a1");
  const bad = await provisionApixisWorldAgent({ email: "a@b.co" }, { env: { APIXIS_WORLD_KEY: key }, fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ ok: false, error: "unauthorized" }) }) });
  assert.deepEqual(bad, { ok: false, status: 401, error: "unauthorized" });
});

test("worldAgentView without an agent links to /enter", () => {
  assert.deepEqual(worldAgentView({}), { ready: false, id: null, name: null, enterUrl: "https://www.apixis.dev/enter?from=geoxis" });
});
