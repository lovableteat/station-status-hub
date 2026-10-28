"""``python -m autocheck_api --host 0.0.0.0 --port 8000`` starts the AutoCheck 比對伺服器."""
import argparse

import uvicorn


def main() -> None:
    parser = argparse.ArgumentParser(description="AutoCheck 比對伺服器")
    parser.add_argument("--host", default="127.0.0.1", help="監聽位址；給其他電腦用請填 0.0.0.0")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--workers", type=int, default=1, help="同時處理的程序數；每個程序一次跑一件比對")
    args = parser.parse_args()
    uvicorn.run("autocheck_api.app:app", host=args.host, port=args.port, workers=args.workers, log_level="info")


if __name__ == "__main__":
    main()
