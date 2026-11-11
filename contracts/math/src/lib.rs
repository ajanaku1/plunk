//! Overflow-free integer helpers shared by the launchpad and coin contracts.
#![no_std]

const LO: u128 = u64::MAX as u128;

/// floor(a * b / d) using a full 256-bit intermediate product.
/// Panics if d == 0 or the result does not fit in u128.
pub fn mul_div(a: u128, b: u128, d: u128) -> u128 {
    assert!(d != 0, "mul_div: divide by zero");
    checked_mul_div(a, b, d).expect("mul_div: overflow")
}

/// floor(a * b / d), or None if d == 0 or the result does not fit in u128.
pub fn checked_mul_div(a: u128, b: u128, d: u128) -> Option<u128> {
    let (hi, lo) = mul_wide(a, b);
    if hi >= d {
        return None;
    }
    let (mut rem, mut q) = (hi, 0u128);
    for i in (0..128).rev() {
        let carry = rem >> 127;
        rem = (rem << 1) | ((lo >> i) & 1);
        q <<= 1;
        if carry == 1 || rem >= d {
            rem = rem.wrapping_sub(d);
            q |= 1;
        }
    }
    Some(q)
}

/// ceil(a * b / d).
pub fn mul_div_ceil(a: u128, b: u128, d: u128) -> u128 {
    let q = mul_div(a, b, d);
    if mul_wide(q, d) == mul_wide(a, b) { q } else { q + 1 }
}

/// floor(sqrt(a * b)) over the full 256-bit product, by binary search on the root.
pub fn isqrt_mul(a: u128, b: u128) -> u128 {
    let target = mul_wide(a, b);
    // Largest r with r² ≤ a·b. `mid + 1` never overflows because mid < hi ≤ u128::MAX.
    let (mut lo, mut hi) = (0u128, u128::MAX);
    while lo < hi {
        let mid = lo + (hi - lo) / 2;
        if mul_wide(mid + 1, mid + 1) <= target { lo = mid + 1 } else { hi = mid }
    }
    lo
}

/// Full 256-bit product of two u128 values as (high, low).
fn mul_wide(a: u128, b: u128) -> (u128, u128) {
    let (a1, a0, b1, b0) = (a >> 64, a & LO, b >> 64, b & LO);
    let (p00, p01, p10, p11) = (a0 * b0, a0 * b1, a1 * b0, a1 * b1);
    let mid = (p00 >> 64) + (p01 & LO) + (p10 & LO);
    let lo = (p00 & LO) | (mid << 64);
    let hi = p11 + (p01 >> 64) + (p10 >> 64) + (mid >> 64);
    (hi, lo)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mul_div_small_matches_native() {
        assert_eq!(mul_div(7, 9, 4), 15);
        assert_eq!(mul_div_ceil(7, 9, 4), 16);
        assert_eq!(mul_div_ceil(8, 2, 4), 4);
        assert_eq!(mul_div_ceil(0, 5, 3), 0);
    }

    #[test]
    fn mul_div_wide_product() {
        let near = 10u128.pow(24);
        // 1M NEAR * 1e24 / 2e21 = 5e32, product is ~1e54 (far beyond u128)
        assert_eq!(mul_div(1_000_000 * near, near, 2 * 10u128.pow(21)), 5 * 10u128.pow(32));
        assert_eq!(mul_div(u128::MAX, u128::MAX, u128::MAX), u128::MAX);
    }

    #[test]
    fn isqrt_mul_exact_and_floor() {
        assert_eq!(isqrt_mul(4, 9), 6);
        assert_eq!(isqrt_mul(2, 2), 2);
        assert_eq!(isqrt_mul(0, 7), 0);
        let near = 10u128.pow(24);
        // sqrt(198e24 * 5e32) = sqrt(9.9e58); reference from Python's Decimal at 60 digits.
        let r = isqrt_mul(198 * near, 500_000_000 * near);
        assert_eq!(r, 314_642_654_451_045_464_097_436_054_103);
        assert!(mul_wide(r, r) <= mul_wide(198 * near, 500_000_000 * near));
        assert!(mul_wide(r + 1, r + 1) > mul_wide(198 * near, 500_000_000 * near));
        assert_eq!(isqrt_mul(u128::MAX, u128::MAX), u128::MAX);
    }

    #[test]
    #[should_panic(expected = "overflow")]
    fn mul_div_overflow_panics() {
        mul_div(u128::MAX, 2, 1);
    }
}
