"""
Deploy SkyVerdict to a GenLayer network (Studio / studionet / Testnet
Bradbury) using the `genlayer` Python client.

Usage:
    python deploy/deploy.py --network studionet --creator 0xYourCreatorAddress
    python deploy/deploy.py --network testnet_bradbury --creator 0xYourCreatorAddress

This intentionally stays thin — the canonical, always-current way to
deploy is `genlayer deploy` from the CLI (see README.md). This script is
provided for CI / scripted deployments where a Python entrypoint is more
convenient than shelling out.
"""
import argparse
import sys
from pathlib import Path

CONTRACT_PATH = Path(__file__).parent.parent / "contracts" / "SkyVerdict.py"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--network", required=True, choices=["studionet", "testnet_bradbury"])
    parser.add_argument("--creator", required=True, help="Creator address to receive fee share")
    parser.add_argument("--rpc-url", default=None, help="Override RPC URL from gltest.config.yaml")
    args = parser.parse_args()

    try:
        from genlayer import client as gl_client  # actual client name may
        # differ by SDK version — see https://docs.genlayer.com for the
        # current `genlayer-py` / CLI deployment client entrypoint.
    except ImportError:
        print(
            "This script expects the `genlayer` CLI/SDK to be installed "
            "(`pip install genlayer-py` or equivalent — see "
            "https://docs.genlayer.com/developers/intelligent-contracts/"
            "getting-started). Prefer `genlayer deploy` directly if in doubt.",
            file=sys.stderr,
        )
        return 1

    code = CONTRACT_PATH.read_text()
    print(f"Deploying SkyVerdict to {args.network} with creator={args.creator} ...")
    tx = gl_client.deploy_contract(
        network=args.network,
        rpc_url=args.rpc_url,
        code=code,
        constructor_args=[args.creator],
    )
    print("Deployed. Contract address:", tx.contract_address)
    print("Transaction hash:", tx.hash)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
