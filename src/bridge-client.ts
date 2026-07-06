import { satisfies, validRange } from "./semver.js";

// ── Bridge response types ──────────────────────────────────────────────

export interface StatusResponse {
  bridge_api_version: string;
  mission_planner_version: string;
  connected: boolean;
  port: string | null;
  vehicle_type: string | null;
  vehicle_firmware: string | null;
  armed: boolean | null;
  selected_sysid: number | null;
  selected_compid: number | null;
  params_loaded: number;
  params_total: number;
}

export interface ParamSummary {
  name: string;
  value: number;
  type: string;
}

export interface ParamsListResponse {
  vehicle_type: string;
  params_loaded: number;
  params_total: number;
  params: ParamSummary[];
}

export interface ParamDetailResponse {
  vehicle_type: string;
  name: string;
  value: number;
  type: string;
  metadata_available: boolean;
  display_name: string | null;
  description: string | null;
  units: string | null;
  unit_text: string | null;
  range: { min: number; max: number } | null;
  values: Record<string, string> | null;
  increment: string | null;
  user: string | null;
  bitmask: Record<string, string> | null;
  reboot_required: string | null;
  read_only: string | null;
  volatile: string | null;
  calibration: string | null;
}

export interface SetParamResponse {
  name: string;
  requested_value: number;
  applied_value: number;
  changed: boolean;
  reboot_required: boolean;
}

export interface BridgeError {
  error: string;
  message: string;
}

// ── Client ─────────────────────────────────────────────────────────────

const COMPATIBLE_RANGE = ">=0.1.0 <1.0.0";
const DEFAULT_BASE_URL = "http://127.0.0.1:9999";
const REQUEST_TIMEOUT_MS = 5000;

export class BridgeClient {
  private readonly baseUrl: string;

  constructor(baseUrl: string = DEFAULT_BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  async getStatus(): Promise<StatusResponse> {
    return this.get<StatusResponse>("/status");
  }

  async getParams(): Promise<ParamsListResponse> {
    return this.get<ParamsListResponse>("/params");
  }

  async getParam(name: string): Promise<ParamDetailResponse> {
    return this.get<ParamDetailResponse>(
      `/params/${encodeURIComponent(name)}`,
    );
  }

  async setParam(
    name: string,
    value: number,
    expectedCurrentValue: number,
  ): Promise<SetParamResponse> {
    return this.post<SetParamResponse>(`/params/${encodeURIComponent(name)}`, {
      value,
      expected_current_value: expectedCurrentValue,
    });
  }

  async checkCompatibility(): Promise<{
    compatible: boolean;
    bridgeVersion: string;
    reason?: string;
  }> {
    try {
      const status = await this.getStatus();
      const version = status.bridge_api_version;

      if (!validRange(COMPATIBLE_RANGE)) {
        return {
          compatible: false,
          bridgeVersion: version,
          reason: `Invalid compatibility range: ${COMPATIBLE_RANGE}`,
        };
      }

      if (!satisfies(version, COMPATIBLE_RANGE)) {
        return {
          compatible: false,
          bridgeVersion: version,
          reason: `Bridge API version ${version} is not compatible with range ${COMPATIBLE_RANGE}`,
        };
      }

      return { compatible: true, bridgeVersion: version };
    } catch (e) {
      return {
        compatible: false,
        bridgeVersion: "unknown",
        reason: `Cannot reach MP bridge at ${this.baseUrl}: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  private async get<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      REQUEST_TIMEOUT_MS,
    );

    try {
      const response = await fetch(url, { signal: controller.signal });

      if (!response.ok) {
        const body = (await response
          .json()
          .catch(() => null)) as BridgeError | null;
        const msg = body?.message ?? `HTTP ${response.status}`;
        throw new Error(`Bridge error (${body?.error ?? "unknown"}): ${msg}`);
      }

      return (await response.json()) as T;
    } catch (e) {
      if (e instanceof TypeError && (e as NodeJS.ErrnoException).cause) {
        throw new Error(
          `Cannot reach MP bridge at ${this.baseUrl} — is Mission Planner running?`,
        );
      }
      throw e;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async post<T>(path: string, payload: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      REQUEST_TIMEOUT_MS,
    );

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        const parsed = (await response
          .json()
          .catch(() => null)) as (BridgeError & { current_value?: number }) | null;

        if (response.status === 409) {
          const cur = parsed?.current_value;
          throw new Error(
            `Bridge error (value_mismatch): expected_current_value did not match the live value` +
              (cur !== undefined ? ` (current value is ${cur})` : "") +
              `. Call get_param again to fetch the current value, then retry.`,
          );
        }

        if (response.status === 504) {
          throw new Error(
            `Bridge error (timeout): Mission Planner did not receive an acknowledgement in time — ` +
              `the write's outcome is ambiguous. Call get_param to check the live value before retrying.`,
          );
        }

        const msg = parsed?.message ?? `HTTP ${response.status}`;
        throw new Error(`Bridge error (${parsed?.error ?? "unknown"}): ${msg}`);
      }

      return (await response.json()) as T;
    } catch (e) {
      if (e instanceof TypeError && (e as NodeJS.ErrnoException).cause) {
        throw new Error(
          `Cannot reach MP bridge at ${this.baseUrl} — is Mission Planner running?`,
        );
      }
      throw e;
    } finally {
      clearTimeout(timeout);
    }
  }
}
