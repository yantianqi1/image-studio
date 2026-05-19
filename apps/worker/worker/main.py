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
from apps.worker.worker.tasks.image_jobs import run_next_image_jobs

WORKER_BRANCH_COUNT = 3
WORKER_BRANCH_NAMES = ("comic-task", "comic-orchestration", "image-jobs")


@dataclass(frozen=True)
class WorkerRunResult:
    comic_task_id: str | None
    comic_action: str | None
    image_job_ids: list[int]


@dataclass(frozen=True)
class WorkerBranch:
    name: str
    run_once: Callable[[], str | None]


def build_bootstrap_message() -> str:
    settings = get_settings()
    return f"{settings.worker_name} bootstrapped in {settings.app_env}."


def run_once() -> str:
    return format_run_result(run_worker_branches())


def run_worker_branches() -> WorkerRunResult:
    with ThreadPoolExecutor(max_workers=WORKER_BRANCH_COUNT) as executor:
        comic_task_future = executor.submit(run_next_comic_task)
        comic_action_future = executor.submit(run_next_comic_orchestration)
        image_jobs_future = executor.submit(run_next_image_jobs)
        return WorkerRunResult(
            comic_task_id=comic_task_future.result(),
            comic_action=comic_action_future.result(),
            image_job_ids=image_jobs_future.result(),
        )


def format_run_result(result: WorkerRunResult) -> str:
    message = join_processed_messages(build_processed_messages(result))
    if message is None:
        return "No claimable comic tasks or image jobs."
    return message


def build_processed_messages(result: WorkerRunResult) -> list[str]:
    messages: list[str] = []
    if result.comic_task_id is not None:
        messages.append(f"Processed comic task {result.comic_task_id}")
    if result.comic_action is not None:
        messages.append(f"Processed comic orchestration {result.comic_action}")
    messages.extend(format_image_job_messages(result.image_job_ids))
    return messages


def format_image_job_messages(image_job_ids: list[int]) -> list[str]:
    if len(image_job_ids) == 1:
        return [f"Processed image job {image_job_ids[0]}"]
    if len(image_job_ids) > 1:
        return [f"Processed image jobs {', '.join(str(job_id) for job_id in image_job_ids)}"]
    return []


def join_processed_messages(messages: list[str]) -> str | None:
    if not messages:
        return None
    return "; ".join(messages) + "."


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="commercial-studio worker")
    parser.add_argument("--once", action="store_true", help="process at most one comic task or image job")
    return parser.parse_args()


def serve_forever() -> None:
    settings = get_settings()
    branches = build_worker_branches()
    with ThreadPoolExecutor(max_workers=len(branches)) as executor:
        futures = [
            executor.submit(serve_worker_branch, branch=branch, poll_interval_seconds=settings.worker_poll_interval_seconds)
            for branch in branches
        ]
        wait_for_worker_branch_failure(futures)


def build_worker_branches() -> list[WorkerBranch]:
    return [
        WorkerBranch(name=WORKER_BRANCH_NAMES[0], run_once=run_comic_task_branch_once),
        WorkerBranch(name=WORKER_BRANCH_NAMES[1], run_once=run_comic_orchestration_branch_once),
        WorkerBranch(name=WORKER_BRANCH_NAMES[2], run_once=run_image_jobs_branch_once),
    ]


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


def run_image_jobs_branch_once() -> str | None:
    return join_processed_messages(format_image_job_messages(run_next_image_jobs()))


def main() -> None:
    args = parse_args()
    initialize_database()
    print(build_bootstrap_message())
    if args.once:
        print(run_once())
        return
    serve_forever()


if __name__ == "__main__":
    main()
