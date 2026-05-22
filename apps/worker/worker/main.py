from __future__ import annotations

import argparse
from concurrent.futures import FIRST_EXCEPTION, Future, ThreadPoolExecutor, wait
from dataclasses import dataclass
from typing import Callable
import time

from apps.api.app.infra.db.session import initialize_database
from apps.worker.worker.config import get_settings
from apps.worker.worker.tasks.comic_orchestration import run_next_comic_orchestration
from apps.worker.worker.tasks.comic_tasks import run_next_comic_task

COMIC_TASK_BRANCH_NAME = "comic-task"
COMIC_ORCHESTRATION_BRANCH_NAME = "comic-orchestration"
WORKER_BRANCH_ENV_KEYS = (
    "WORKER_ENABLE_COMIC_TASK",
    "WORKER_ENABLE_COMIC_ORCHESTRATION",
)


@dataclass(frozen=True)
class WorkerBranch:
    name: str
    run_once: Callable[[], str | None]


def build_bootstrap_message() -> str:
    settings = get_settings()
    branch_names = ", ".join(branch.name for branch in build_worker_branches())
    return f"{settings.worker_name} bootstrapped in {settings.app_env}; enabled branches: {branch_names}."


def run_once() -> str:
    return format_run_messages(run_worker_branches())


def run_worker_branches() -> list[str | None]:
    branches = build_worker_branches()
    with ThreadPoolExecutor(max_workers=len(branches)) as executor:
        futures = [executor.submit(branch.run_once) for branch in branches]
        return [future.result() for future in futures]


def format_run_messages(messages: list[str | None]) -> str:
    processed_messages = [
        strip_terminal_period(message)
        for message in messages
        if message is not None
    ]
    message = join_processed_messages(processed_messages)
    if message is None:
        return "No claimable comic tasks."
    return message


def strip_terminal_period(message: str) -> str:
    if message.endswith("."):
        return message[:-1]
    return message


def join_processed_messages(messages: list[str]) -> str | None:
    if not messages:
        return None
    return "; ".join(messages) + "."


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="commercial-studio worker")
    parser.add_argument("--once", action="store_true", help="process each enabled worker branch once")
    return parser.parse_args()


def serve_forever() -> None:
    settings = get_settings()
    branches = build_worker_branches()
    with ThreadPoolExecutor(max_workers=len(branches)) as executor:
        futures = [
            executor.submit(
                serve_worker_branch,
                branch=branch,
                poll_interval_seconds=settings.worker_poll_interval_seconds,
            )
            for branch in branches
        ]
        wait_for_worker_branch_failure(futures)


def build_worker_branches() -> list[WorkerBranch]:
    settings = get_settings()
    branches: list[WorkerBranch] = []
    if settings.worker_enable_comic_task:
        branches.append(WorkerBranch(name=COMIC_TASK_BRANCH_NAME, run_once=run_comic_task_branch_once))
    if settings.worker_enable_comic_orchestration:
        branches.append(WorkerBranch(
            name=COMIC_ORCHESTRATION_BRANCH_NAME,
            run_once=run_comic_orchestration_branch_once,
        ))
    if not branches:
        env_names = ", ".join(WORKER_BRANCH_ENV_KEYS)
        raise RuntimeError(f"No worker branches are enabled. Enable at least one of {env_names}.")
    return branches


def serve_worker_branch(*, branch: WorkerBranch, poll_interval_seconds: float) -> None:
    while True:
        message = branch.run_once()
        if message is not None:
            print(message)
        time.sleep(poll_interval_seconds)


def wait_for_worker_branch_failure(futures: list[Future[None]]) -> None:
    done, _ = wait(futures, return_when=FIRST_EXCEPTION)
    for future in done:
        future.result()


def run_comic_task_branch_once() -> str | None:
    task_id = run_next_comic_task()
    if task_id is None:
        return None
    return f"Processed comic task {task_id}."


def run_comic_orchestration_branch_once() -> str | None:
    comic_action = run_next_comic_orchestration()
    if comic_action is None:
        return None
    return f"Processed comic orchestration {comic_action}."


def main() -> None:
    args = parse_args()
    bootstrap_message = build_bootstrap_message()
    initialize_database()
    print(bootstrap_message)
    if args.once:
        print(run_once())
        return
    serve_forever()


if __name__ == "__main__":
    main()
