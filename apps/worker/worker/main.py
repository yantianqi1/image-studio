from __future__ import annotations

import argparse
import time

from apps.api.app.infra.db.session import initialize_database
from apps.worker.worker.config import get_settings
from apps.worker.worker.tasks.comic_orchestration import run_next_comic_orchestration
from apps.worker.worker.tasks.comic_tasks import run_next_comic_task
from apps.worker.worker.tasks.image_jobs import run_next_image_jobs


def build_bootstrap_message() -> str:
    settings = get_settings()
    return f"{settings.worker_name} bootstrapped in {settings.app_env}."


def run_once() -> str:
    comic_task_id = run_next_comic_task()
    if comic_task_id is not None:
        return f"Processed comic task {comic_task_id}."
    comic_action = run_next_comic_orchestration()
    if comic_action is not None:
        return f"Processed comic orchestration {comic_action}."
    image_job_ids = run_next_image_jobs()
    if len(image_job_ids) == 1:
        return f"Processed image job {image_job_ids[0]}."
    if len(image_job_ids) > 1:
        return f"Processed image jobs {', '.join(str(job_id) for job_id in image_job_ids)}."
    return "No claimable comic tasks or image jobs."


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="commercial-studio worker")
    parser.add_argument("--once", action="store_true", help="process at most one comic task or image job")
    return parser.parse_args()


def serve_forever() -> None:
    settings = get_settings()
    while True:
        print(run_once())
        time.sleep(settings.worker_poll_interval_seconds)


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
