from apps.worker.worker.config import get_settings


def build_bootstrap_message() -> str:
    settings = get_settings()
    return (
        f"{settings.worker_name} bootstrapped in {settings.app_env}. "
        "Task handlers will be wired in the next execution batch."
    )


def main() -> None:
    print(build_bootstrap_message())


if __name__ == "__main__":
    main()

