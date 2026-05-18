;;; mediant-capture-templates-test.el --- Tests for mediant-capture-templates -*- lexical-binding: t; -*-

;;; Code:

(require 'ert)
(require 'org)
(require 'org-capture)

;; Declare as special so let-binding is dynamic inside mediant--read-timestamp.
(defvar org-time-was-given)
(defvar org-end-time-was-given)

(setq org-directory "/tmp/mediant-test-org/")

(require 'mediant-capture-templates)

;; ── mediant--read-timestamp ──────────────────────────────────────────────────

(ert-deftest mediant-capture-templates-test-timestamp-date-only ()
  "Without a time component, produces a date-only active timestamp."
  (let ((org-time-was-given nil)
        (org-end-time-was-given nil)
        (system-time-locale "C"))
    (cl-letf (((symbol-function 'org-read-date)
               (lambda (&rest _) (encode-time 0 0 0 15 6 2026))))
      (should (equal "<2026-06-15 Mon>" (mediant--read-timestamp))))))

(ert-deftest mediant-capture-templates-test-timestamp-with-time ()
  "With a time component, HH:MM is included in the timestamp."
  (let ((org-time-was-given t)
        (org-end-time-was-given nil)
        (system-time-locale "C"))
    (cl-letf (((symbol-function 'org-read-date)
               (lambda (&rest _) (encode-time 0 30 14 15 6 2026))))
      (should (equal "<2026-06-15 Mon 14:30>" (mediant--read-timestamp))))))

(ert-deftest mediant-capture-templates-test-timestamp-with-repeater ()
  "A repeater is embedded inside the timestamp brackets."
  (let ((org-time-was-given nil)
        (org-end-time-was-given nil)
        (system-time-locale "C"))
    (cl-letf (((symbol-function 'org-read-date)
               (lambda (&rest _) (encode-time 0 0 0 15 6 2026))))
      (should (equal "<2026-06-15 Mon +1w>" (mediant--read-timestamp "+1w"))))))

(ert-deftest mediant-capture-templates-test-timestamp-with-end-time ()
  "An end time is appended after a dash inside the timestamp."
  (let ((org-time-was-given t)
        (org-end-time-was-given "15:30")
        (system-time-locale "C"))
    (cl-letf (((symbol-function 'org-read-date)
               (lambda (&rest _) (encode-time 0 0 14 15 6 2026))))
      (should (equal "<2026-06-15 Mon 14:00-15:30>" (mediant--read-timestamp))))))

(ert-deftest mediant-capture-templates-test-timestamp-custom-prompt ()
  "The PROMPT argument is forwarded to org-read-date."
  (let ((org-time-was-given nil)
        (org-end-time-was-given nil)
        received-prompt)
    (cl-letf (((symbol-function 'org-read-date)
               (lambda (_inactive _to-time _default prompt &rest _)
                 (setq received-prompt prompt)
                 (encode-time 0 0 0 1 1 2026))))
      (mediant--read-timestamp nil "Deadline: ")
      (should (equal "Deadline: " received-prompt)))))

;; ── Template registration ────────────────────────────────────────────────────

(ert-deftest mediant-capture-templates-test-all-keys-registered ()
  "All eight templates are present in org-capture-templates."
  (dolist (key '("t" "d" "s" "b" "e" "w" "m" "y"))
    (should (assoc key org-capture-templates))))

(ert-deftest mediant-capture-templates-test-template-order ()
  "Templates appear in the order t d s b e w m y (not reversed)."
  (let* ((keys '("t" "d" "s" "b" "e" "w" "m" "y"))
         (positions (mapcar (lambda (key)
                              (seq-position org-capture-templates key
                                            (lambda (tpl k) (equal (car tpl) k))))
                            keys)))
    (should (equal positions (sort (copy-sequence positions) #'<)))))

(ert-deftest mediant-capture-templates-test-task-templates-target-tasks-heading ()
  "Task templates t d s b target the Tasks headline."
  (dolist (key '("t" "d" "s" "b"))
    (let* ((tpl (assoc key org-capture-templates))
           (target (nth 3 tpl)))
      (should (eq 'file+headline (car target)))
      (should (equal "Tasks" (nth 2 target))))))

(ert-deftest mediant-capture-templates-test-event-templates-target-events-heading ()
  "Event templates e w m y target the Events headline."
  (dolist (key '("e" "w" "m" "y"))
    (let* ((tpl (assoc key org-capture-templates))
           (target (nth 3 tpl)))
      (should (eq 'file+headline (car target)))
      (should (equal "Events" (nth 2 target))))))

(ert-deftest mediant-capture-templates-test-file-path-uses-org-directory ()
  "All templates resolve Mediant.org relative to org-directory."
  (let ((expected (expand-file-name "Mediant.org" org-directory)))
    (dolist (key '("t" "d" "s" "b" "e" "w" "m" "y"))
      (let* ((tpl (assoc key org-capture-templates))
             (file (nth 1 (nth 3 tpl))))
        (should (equal expected file))))))

(provide 'mediant-capture-templates-test)

;;; mediant-capture-templates-test.el ends here
