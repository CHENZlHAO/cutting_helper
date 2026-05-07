import base64
import os
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC


class CryptoService:
    def __init__(self):
        self.key = self._derive_key()

    def _derive_key(self) -> bytes:
        # Use machine-specific seed + app-specific salt
        seed = os.environ.get("CUTTING_HELPER_SECRET", "")
        if not seed:
            import hashlib
            import platform
            import uuid
            raw = f"{platform.node()}-{uuid.getnode()}-cutting_helper"
            seed = hashlib.sha256(raw.encode()).hexdigest()

        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=b"cutting_helper_salt",
            iterations=480000,
        )
        key = base64.urlsafe_b64encode(kdf.derive(seed.encode()))
        return key

    def encrypt(self, plaintext: str) -> str:
        return Fernet(self.key).encrypt(plaintext.encode()).decode()

    def decrypt(self, ciphertext: str) -> str:
        return Fernet(self.key).decrypt(ciphertext.encode()).decode()
