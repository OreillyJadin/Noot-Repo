import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const screen = readFileSync(new URL('../apps/mobile/app/admin_tutors.tsx', import.meta.url), 'utf8');
const tabs = readFileSync(new URL('../apps/mobile/lib/AdminTabs.tsx', import.meta.url), 'utf8');

assert.match(screen, /const \[refreshKey, setRefreshKey\] = useState\(0\)/);
assert.match(screen, /useAdminHubCounts\(true, refreshKey\)/);

const decide = screen.slice(screen.indexOf('const decide = async'), screen.indexOf('const schedule ='));
const [success, failure] = decide.split('} catch (e) {');
assert.match(success, /if \(action === 'verify'\) await api\.admin\.verifyTutorGrades/);
assert.match(success, /else if \(action === 'reject'\) await api\.admin\.approveTutor/);
assert.match(success, /else await api\.admin\.approveTutor/);
assert.match(success, /verifyGrades: action === 'approveAndVerify'/);
assert.match(success, /setPending\([\s\S]*?setRefreshKey\(\(key\) => key \+ 1\)/);
assert.equal((decide.match(/setRefreshKey/g) ?? []).length, 1);
assert.doesNotMatch(failure, /setRefreshKey/);
assert.match(tabs, /useFocusEffect\([\s\S]*?\.hubCounts\(\)[\s\S]*?\[enabled, refreshKey\]/);

console.log('verify_admin_badge_refresh: successful decisions refresh tab counts; failures do not; focus effect depends on refreshKey');
