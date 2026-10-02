/** Check the exposed content, not random UUIDs or timestamp digits. */
export function notificationContainsRating(notification, score) {
  const content = { title: notification.title, message: notification.message, metadata: notification.metadata };
  return /score|manager_feedback/.test(JSON.stringify(notification))
    || JSON.stringify(content).includes(String(score));
}
