// Catalog suggestions for a search box: "calc" → MATH 125 · Calculus I.
//
// Search only ever matched tutors' own course lists, so finding a class meant already knowing
// its code — typing what the class is actually called found nothing. This looks the query up
// against the real catalog so the student can search by name and land on the right code.
//
// Suppressed once the query already IS a course code, so the list doesn't sit under a
// completed search suggesting the thing you just picked.
import { useEffect, useRef, useState } from 'react';
import { api, type CatalogCourse } from '@noot/core';

export function useCourseSuggestions(query: string, limit = 4): CatalogCourse[] {
  const [items, setItems] = useState<CatalogCourse[]>([]);
  const seq = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setItems([]);
      return;
    }
    const mine = ++seq.current;
    const id = setTimeout(() => {
      api.courses
        .search(q, limit + 1)
        .then((rows) => {
          if (seq.current !== mine) return;
          const exact = rows.some((r) => r.courseCode.toLowerCase() === q.toLowerCase());
          setItems(exact ? [] : rows.slice(0, limit));
        })
        .catch(() => { if (seq.current === mine) setItems([]); });
    }, 220);
    return () => clearTimeout(id);
  }, [query, limit]);

  return items;
}
