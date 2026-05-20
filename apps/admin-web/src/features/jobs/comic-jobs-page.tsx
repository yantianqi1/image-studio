"use client";

import { useEffect, useState } from "react";

import { AdminShell } from "@/features/shell/admin-shell";
import { ErrorBox } from "@/features/ui/error-box";
import { Panel } from "@/features/ui/panel";
import { StatusPill } from "@/features/ui/status-pill";
import { formatComicTaskTypeLabel } from "@/features/ui/admin-labels";
import { adminApi } from "@/lib/admin-api";
import { formatDateTime } from "@/features/users/user-format";

export function ComicJobsPage() {
  const [tasks, setTasks] = useState<
    readonly {
      id: string;
      task_type: string;
      status: string;
      created_at: string;
    }[]
  >([]);
  const [error, setError] = useState("");

  useEffect(() => {
    adminApi
      .comicTasks()
      .then(setTasks)
      .catch((nextError) => {
        setError(
          nextError instanceof Error ? nextError.message : "读取漫画任务失败",
        );
      });
  }, []);

  return (
    <AdminShell
      title="漫画任务"
      description="查看漫画任务状态，便于排查导入、拆章、分镜和渲染任务。"
    >
      <div className="col-span-12">
        <Panel title="任务列表" description="读取后台漫画任务接口。">
          {error ? <ErrorBox message={error} /> : null}
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {tasks.map((task) => (
              <div key={task.id} className="admin-card">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-gray-400">{formatComicTaskTypeLabel(task.task_type)}</span>
                  <StatusPill status={task.status} />
                </div>
                <p className="mt-1 text-xs text-gray-400">{formatDateTime(task.created_at)}</p>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </AdminShell>
  );
}
