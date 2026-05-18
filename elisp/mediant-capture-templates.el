;;; mediant-capture-templates.el --- Org capture templates for Mediant.org -*- lexical-binding: t; -*-

;; Author: Mediant
;; Version: 0.1.0
;; Package-Requires: ((emacs "27.1") (org "9.5"))
;; Keywords: outlines, calendar

;;; Commentary:

;; Registers org-capture templates that append entries to the Tasks and
;; Events sections of a Mediant.org file.
;;
;; Templates:
;;   t  Someday task                 — plain TODO heading
;;   d  Task with deadline           — TODO with DEADLINE
;;   s  Scheduled task               — TODO with SCHEDULED
;;   b  Scheduled task with deadline — TODO with DEADLINE and SCHEDULED
;;   e  Event                        — plain heading with a standalone timestamp
;;   w  Weekly event                 — event with a +1w repeating timestamp
;;   m  Monthly event                — event with a +1m repeating timestamp
;;   y  Yearly event                 — event with a +1y repeating timestamp
;;
;; Load this file after org-capture is available:
;;
;;   (add-to-list 'load-path "/path/to/Mediant/elisp")
;;   (load "mediant-capture-templates")

;;; Code:

(defvar org-time-was-given)
(defvar org-end-time-was-given)

(defun mediant--read-timestamp (&optional repeater prompt)
  "Prompt for a date/time and return an active Org timestamp string.
If REPEATER (e.g. \"+1w\") is non-nil, embed it inside the brackets.
PROMPT overrides the default minibuffer prompt."
  (let ((time (org-read-date nil t nil (or prompt "Date: "))))
    (concat "<" (format-time-string
                 (if org-time-was-given "%Y-%m-%d %a %H:%M" "%Y-%m-%d %a")
                 time)
            (if org-end-time-was-given (concat "-" org-end-time-was-given) "")
            (if repeater (concat " " repeater) "")
            ">")))

(with-eval-after-load 'org-capture
  (let ((mediant-file (expand-file-name "Mediant.org" org-directory)))
    (dolist (template
           `(("t" "Someday task" entry
              (file+headline ,mediant-file "Tasks")
              "* TODO %?\n")
             ("d" "Task with deadline" entry
              (file+headline ,mediant-file "Tasks")
              (function ,(lambda ()
                           (concat "* TODO %?\nDEADLINE: "
                                   (mediant--read-timestamp nil "Deadline: ")
                                   "\n"))))
             ("s" "Scheduled task" entry
              (file+headline ,mediant-file "Tasks")
              (function ,(lambda ()
                           (concat "* TODO %?\nSCHEDULED: "
                                   (mediant--read-timestamp nil "Scheduled: ")
                                   "\n"))))
             ;; Note: DEADLINE and SCHEDULED must be on the same line (separated
             ;; by a space), in that order, for Mediant (and Org agenda) to
             ;; parse them as planning info.
             ("b" "Scheduled task with deadline" entry
              (file+headline ,mediant-file "Tasks")
              (function ,(lambda ()
                           (let ((deadline (mediant--read-timestamp nil "Deadline: "))
                                 (scheduled (mediant--read-timestamp nil "Scheduled: ")))
                             (concat "* TODO %?\nDEADLINE: " deadline
                                     " SCHEDULED: " scheduled "\n")))))
             ("e" "Event" entry
              (file+headline ,mediant-file "Events")
              (function ,(lambda ()
                           (concat "* %?\n" (mediant--read-timestamp nil "Event: ") "\n"))))
             ("w" "Weekly event" entry
              (file+headline ,mediant-file "Events")
              (function ,(lambda ()
                           (concat "* %?\n" (mediant--read-timestamp "+1w" "Weekly: ") "\n"))))
             ("m" "Monthly event" entry
              (file+headline ,mediant-file "Events")
              (function ,(lambda ()
                           (concat "* %?\n" (mediant--read-timestamp "+1m" "Monthly: ") "\n"))))
             ("y" "Yearly event" entry
              (file+headline ,mediant-file "Events")
              (function ,(lambda ()
                           (concat "* %?\n" (mediant--read-timestamp "+1y" "Yearly: ") "\n"))))))
      (add-to-list 'org-capture-templates template t))))

(provide 'mediant-capture-templates)

;;; mediant-capture-templates.el ends here
