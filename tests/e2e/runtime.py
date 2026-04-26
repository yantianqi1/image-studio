from __future__ import annotations

import os
import signal
import socket
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen

API_PORT = 7810
PUBLIC_PORT = 7710
ADMIN_PORT = 7711
NEXT_CLI = "../../node_modules/.pnpm/next@16.2.4_@babel+core@7.29.0_react-dom@19.2.4_react@19.2.4__react@19.2.4/node_modules/next/dist/bin/next"
REQUEST_TIMEOUT_SECONDS = 3
SERVER_START_TIMEOUT_SECONDS = 90
SHUTDOWN_TIMEOUT_SECONDS = 5
ADMIN_USERNAME = "e2e-admin"
ADMIN_PASSWORD = "e2e-admin-pass"


@dataclass(frozen=True)
class Service:
    name: str
    command: list[str]
    port: int
    ready_url: str
    app_dir: str = "."


@dataclass(frozen=True)
class RunningService:
    service: Service
    process: subprocess.Popen[str]
    log_path: Path


class ServiceManager:
    def __init__(self, root: Path, runtime_dir: Path) -> None:
        self.root = root
        self.runtime_dir = runtime_dir
        self.services: list[RunningService] = []

    def start_all(self) -> None:
        prepare_frontend_builds(self.root, self.runtime_dir)
        for service in build_services():
            self.start(service)

    def start(self, service: Service) -> None:
        assert_port_available(service.port)
        log_path = self.runtime_dir / f"{service.name}.log"
        process = subprocess.Popen(
            service.command,
            cwd=self.root / service.app_dir,
            env=build_env(self.root, self.runtime_dir),
            stdout=log_path.open("w", encoding="utf-8"),
            stderr=subprocess.STDOUT,
            text=True,
        )
        running = RunningService(service, process, log_path)
        self.services.append(running)
        wait_for_service(running)

    def stop_all(self) -> None:
        for running in reversed(self.services):
            stop_process(running.process)

    def log_summary(self) -> str:
        return "\n\n".join(format_log_tail(item) for item in self.services)


def prepare_frontend_builds(root: Path, runtime_dir: Path) -> None:
    env = build_env(root, runtime_dir)
    for command in (["pnpm", "build:public"], ["pnpm", "build:admin"]):
        subprocess.run(command, cwd=root, env=env, check=True)


def build_services() -> list[Service]:
    return [
        Service(
            "api",
            ["python3", "tests/e2e/api_server.py"],
            API_PORT,
            f"http://127.0.0.1:{API_PORT}/health",
        ),
        Service(
            "public-web",
            ["node", NEXT_CLI, "start", "--port", str(PUBLIC_PORT)],
            PUBLIC_PORT,
            f"http://127.0.0.1:{PUBLIC_PORT}/",
            "apps/public-web",
        ),
        Service(
            "admin-web",
            ["node", NEXT_CLI, "start", "--port", str(ADMIN_PORT)],
            ADMIN_PORT,
            f"http://127.0.0.1:{ADMIN_PORT}/",
            "apps/admin-web",
        ),
    ]


def build_env(root: Path, runtime_dir: Path) -> dict[str, str]:
    env = os.environ.copy()
    env.update(
        {
            "APP_ENV": "test",
            "API_BASE_URL": f"http://127.0.0.1:{API_PORT}",
            "DATABASE_URL": f"sqlite:///{runtime_dir / 'e2e.db'}",
            "DEFAULT_ADMIN_USERNAME": ADMIN_USERNAME,
            "DEFAULT_ADMIN_PASSWORD": ADMIN_PASSWORD,
            "GENERATED_ASSETS_DIR": str(runtime_dir / "generated-assets"),
            "NEXT_TELEMETRY_DISABLED": "1",
            "PYTHONPATH": str(root),
            "SESSION_SECRET": "e2e-session-secret",
        }
    )
    return env


def assert_port_available(port: int) -> None:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        if sock.connect_ex(("127.0.0.1", port)) == 0:
            raise RuntimeError(f"Port {port} is already in use")


def wait_for_service(running: RunningService) -> None:
    deadline = time.monotonic() + SERVER_START_TIMEOUT_SECONDS
    while time.monotonic() < deadline:
        if running.process.poll() is not None:
            raise RuntimeError(format_log_tail(running))
        if is_ready(running.service.ready_url):
            return
        time.sleep(1)
    raise TimeoutError(format_log_tail(running))


def is_ready(url: str) -> bool:
    try:
        with urlopen(url, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            return 200 <= response.status < 500
    except (TimeoutError, URLError):
        return False


def stop_process(process: subprocess.Popen[str]) -> None:
    if process.poll() is not None:
        return
    process.send_signal(signal.SIGTERM)
    try:
        process.wait(timeout=SHUTDOWN_TIMEOUT_SECONDS)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=SHUTDOWN_TIMEOUT_SECONDS)


def format_log_tail(running: RunningService) -> str:
    lines = running.log_path.read_text(encoding="utf-8", errors="replace").splitlines()
    tail = "\n".join(lines[-80:])
    return f"--- {running.service.name} log: {running.log_path} ---\n{tail}"
