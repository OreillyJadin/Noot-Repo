import type { AdminCourseRequest, CourseRequest } from './models';

export function mapCourseRequest(row: Record<string, unknown>): CourseRequest {
  return {
    id: String(row.id),
    courseCode: String(row.courseCode ?? row.course_code),
    status: String(row.status) as CourseRequest['status'],
    createdAt: String(row.createdAt ?? row.created_at),
  };
}

export function mapAdminCourseRequest(row: Record<string, unknown>): AdminCourseRequest {
  return {
    courseCode: String(row.course_code),
    courseTitle: String(row.course_title ?? ''),
    requests: Number(row.requests ?? 0),
    latestAt: String(row.latest_at),
    covered: Boolean(row.covered),
  };
}
