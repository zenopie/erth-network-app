import { MAT_DIAG4, ROUND_CONSTANTS } from "./poseidon2Constants";

/**
 * Poseidon2 over BN254, as the chain's zk/poseidon2 and the Noir circuits
 * define it (noir-lang/poseidon v0.3.0): t = 4, x^5 S-box, 4 + 56 + 4 rounds,
 * and Barretenberg's fixed-length sponge — rate 3, capacity 1, the capacity
 * slot seeded with len(inputs) << 64, one element squeezed.
 *
 * Plain BigInt arithmetic. The web app hashes a handful of elements per
 * note, so speed is not a concern; matching the chain bit for bit is, and the
 * golden vectors in scripts/check-notes.mjs pin it.
 */

/** The BN254 scalar field modulus. */
export const P = 0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001n;

const mod = (x) => {
  const r = x % P;
  return r < 0n ? r + P : r;
};

function sbox(x) {
  const x2 = (x * x) % P;
  const x4 = (x2 * x2) % P;
  return (x4 * x) % P;
}

// The external (M4) matrix, in Barretenberg's addition chain.
function matmulExternal(s) {
  const t0 = s[0] + s[1];
  const t1 = s[2] + s[3];
  const t2 = 2n * s[1] + t1;
  const t3 = 2n * s[3] + t0;
  const t4 = 4n * t1 + t3;
  const t5 = 4n * t0 + t2;
  const t6 = t3 + t5;
  const t7 = t2 + t4;
  s[0] = t6 % P;
  s[1] = t5 % P;
  s[2] = t7 % P;
  s[3] = t4 % P;
}

// The internal matrix: diag(MAT_DIAG4) + the all-ones matrix.
function matmulInternal(s) {
  const sum = s[0] + s[1] + s[2] + s[3];
  for (let i = 0; i < 4; i++) s[i] = (MAT_DIAG4[i] * s[i] + sum) % P;
}

function permute(s) {
  matmulExternal(s);
  for (let r = 0; r < 4; r++) {
    for (let i = 0; i < 4; i++) s[i] = sbox((s[i] + ROUND_CONSTANTS[r][i]) % P);
    matmulExternal(s);
  }
  for (let r = 4; r < 60; r++) {
    s[0] = sbox((s[0] + ROUND_CONSTANTS[r][0]) % P);
    matmulInternal(s);
  }
  for (let r = 60; r < 64; r++) {
    for (let i = 0; i < 4; i++) s[i] = sbox((s[i] + ROUND_CONSTANTS[r][i]) % P);
    matmulExternal(s);
  }
}

/**
 * Poseidon2 hash of field elements (BigInts, each reduced mod P first is a
 * caller error: an input >= P is refused rather than silently reduced).
 */
export function poseidon2(inputs) {
  for (const x of inputs) {
    if (typeof x !== "bigint" || x < 0n || x >= P) {
      throw new RangeError("poseidon2: input is not a canonical field element");
    }
  }
  const state = [0n, 0n, 0n, mod(BigInt(inputs.length) << 64n)];
  let cache = [];
  const duplex = () => {
    for (let i = 0; i < 3; i++) state[i] = (state[i] + (cache[i] ?? 0n)) % P;
    permute(state);
  };
  for (const x of inputs) {
    if (cache.length === 3) {
      duplex();
      cache = [x];
    } else {
      cache.push(x);
    }
  }
  duplex();
  return state[0];
}
