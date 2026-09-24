import os

from hatchling.builders.hooks.plugin.interface import BuildHookInterface


class PlatformWheel(BuildHookInterface):
    """Tag the wheel for the platform of the bundled host binary (set EZVALS_WHEEL_PLATFORM, e.g. macosx_11_0_arm64)."""

    def initialize(self, version, build_data):
        platform = os.environ.get("EZVALS_WHEEL_PLATFORM")
        if platform:
            build_data["pure_python"] = False
            build_data["tag"] = f"py3-none-{platform}"
