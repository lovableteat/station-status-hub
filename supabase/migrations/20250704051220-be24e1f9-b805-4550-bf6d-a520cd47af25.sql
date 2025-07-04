-- Create trigger for automatic system status updates
DROP TRIGGER IF EXISTS trigger_update_system_status ON test_progress;

CREATE TRIGGER trigger_update_system_status
  AFTER INSERT OR UPDATE ON test_progress
  FOR EACH ROW
  EXECUTE FUNCTION update_system_completion_status();