begin;
set local lock_timeout='5s';
create index if not exists comparison_feedback_reviewed_by_idx on workspace.comparison_feedback(reviewed_by);
alter policy "comparison-feedback-read" on workspace.comparison_feedback
using ((select workspace.current_user_can_workspace('ai-chat','view')) and (
  reporter_id=(select workspace.current_system_user_id())
  or (is_submitted and (select comparison_feedback_private.is_admin()))
));
commit;
