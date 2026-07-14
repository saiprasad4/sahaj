"""Independent Curve25519 (short-Weierstrass) ECDH oracle.

Pure Python big-integer EC arithmetic, sharing no code with @noble/curves or the
TypeScript SDK. The curve constants are rederived from the Montgomery form (the
same derivation the SDK's parameters test proves), then affine add/double and
double-and-add scalar multiplication are implemented from scratch.

Emits a known-answer vector: our private scalar, the peer's uncompressed public
point, and the expected ECDH shared secret (the affine X coordinate), all as hex.
"""

P = 2**255 - 19
A_MONT = 486662


def mod(x):
    return x % P


def inv(x):
    return pow(x, P - 2, P)


a = mod((3 - A_MONT * A_MONT) * inv(3))
b = mod((2 * A_MONT**3 - 9 * A_MONT) * inv(27))
Gx = mod(9 + A_MONT * inv(3))
Gy = 0x20AE19A1B8A086B4E01EDD2C7748D14C923D4D7E6D7C61B229E9C5A27ECED3D9

assert mod(Gy * Gy) == mod(Gx**3 + a * Gx + b), "generator not on curve"

INF = None  # point at infinity


def add(p1, p2):
    if p1 is INF:
        return p2
    if p2 is INF:
        return p1
    x1, y1 = p1
    x2, y2 = p2
    if x1 == x2 and mod(y1 + y2) == 0:
        return INF
    if p1 == p2:
        slope = mod((3 * x1 * x1 + a) * inv(2 * y1))
    else:
        slope = mod((y2 - y1) * inv(x2 - x1))
    x3 = mod(slope * slope - x1 - x2)
    y3 = mod(slope * (x1 - x3) - y1)
    return (x3, y3)


def mul(scalar, point):
    result = INF
    addend = point
    while scalar > 0:
        if scalar & 1:
            result = add(result, addend)
        addend = add(addend, addend)
        scalar >>= 1
    return result


def to32(x):
    return x.to_bytes(32, "big")


# The prime-order subgroup order. Scalars are reduced into [1, N) so noble and this
# oracle agree unambiguously (the peer point has order N, so no reduction surprises).
N = 2**252 + 27742317777372353535851937790883648493

# Fixed, deterministic scalars, reduced into range.
our_scalar = 0x091E2D3C4B5A69788796A5B4C3D2E1F00112233445566778899AABBCCDDEEFF01 % N
peer_scalar = 0x0A1B2C3D4E5F60718293A4B5C6D7E8F9000F1E2D3C4B5A69788796A5B4C3D2E1 % N

peer_point = mul(peer_scalar, (Gx, Gy))
shared_point = mul(our_scalar, peer_point)

peer_uncompressed = b"\x04" + to32(peer_point[0]) + to32(peer_point[1])

print("ourPrivateKeyHex        =", to32(our_scalar).hex())
print("peerPublicKeyHex        =", peer_uncompressed.hex())
print("expectedSharedSecretHex =", to32(shared_point[0]).hex())
