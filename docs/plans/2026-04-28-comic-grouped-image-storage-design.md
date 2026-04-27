# Comic Grouped Image Storage Design

## Goal

Save every comic creation's generated image files into one stable local folder named from the user-created project title plus the comic task id.

## Design

Comic images already flow through the normal `image_jobs` pipeline. The change keeps that pipeline and only adds comic-specific storage context when comic orchestration creates image jobs.

Each completed comic task gets a persisted storage folder name:

`<safe-project-title>--<task_id>`

Rendered files are saved under:

- `generated-assets/comics/<folder>/references/` for character reference jobs.
- `generated-assets/comics/<folder>/pages/` for final comic page jobs.

The task id suffix prevents collisions when users reuse the same project title or generate multiple versions from one project. The folder name is stored in `comic_tasks.output_payload` so later orchestration steps do not drift if the project title changes after task creation.

## Data Flow

1. `run_comic_pipeline()` completes the structural comic task.
2. The task output includes the computed `asset_folder_name`.
3. Comic orchestration creates character reference `image_jobs` and page `image_jobs`.
4. Those jobs receive a `storage_subdir` such as `comics/<folder>/references` or `comics/<folder>/pages`.
5. The existing image worker writes the rendered asset into the requested subdirectory and records the resulting `assets.storage_path`.

## Error Handling

No silent fallback is added. If directory creation or file writing fails, the existing image job failure path records the explicit error and marks the job failed after configured attempts.

## Testing

Backend tests cover that comic reference and page assets are persisted under the expected project/task folder while normal image jobs keep their existing default root storage behavior.
