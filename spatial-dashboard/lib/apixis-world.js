// Apixis world provision client for Geoxis (based on Apixis.dev shared/world-provision.js)
// Server-side only — call after first sign-in to provision avatar agent + wallet

export const APIXIS_WORLD_API = process.env.APIXIS_WORLD_API || 'https://www.apixis.dev';
export const APIXIS_WORLD_KEY = process.env.APIXIS_WORLD_KEY || '';
export const CLIENT_NAME = 'geoxis';

/**
 * Provision a world agent for a new user.
 * Idempotent: safe to retry, returns created:false on repeat.
 * 
 * @param {Object} user - { email, email_verified, display_name?, apixis_sub? }
 * @returns {Promise<Object>} { ok, created, citizen_id, agent, enter_url, error? }
 */
export async function provisionWorldAgent(user) {
  if (!APIXIS_WORLD_KEY) {
    return { ok: false, error: 'apixis_world_not_configured' };
  }

  if (!user.email_verified) {
    return { ok: false, error: 'email_not_verified' };
  }

  try {
    const response = await fetch(`${APIXIS_WORLD_API}/api/agent/provision`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${APIXIS_WORLD_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: CLIENT_NAME,
        email: user.email,
        email_verified: true,
        display_name: user.display_name || null,
        apixis_sub: user.apixis_sub || null,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      return {
        ok: false,
        status: response.status,
        error: error.error || 'provision_failed',
      };
    }

    const data = await response.json();
    return {
      ok: data.ok,
      created: data.created,
      citizen_id: data.citizen_id,
      agent: data.agent,
      enter_url: data.enter_url,
      starter_ixis: data.starter_ixis,
    };
  } catch (err) {
    return {
      ok: false,
      error: 'network_error',
      message: err.message,
    };
  }
}

/**
 * Check if user has been provisioned (has world_agent metadata).
 */
export function hasWorldAgent(user) {
  return Boolean(user?.app_metadata?.world_agent?.citizen_id);
}

/**
 * Get world agent data from user metadata.
 */
export function getWorldAgent(user) {
  return user?.app_metadata?.world_agent || null;
}
