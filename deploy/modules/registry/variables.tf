variable "location" {
  description = "The region the repository lives in."
  type        = string
}

variable "repository_id" {
  description = "The repository's id, which the image path names."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{0,62}$", var.repository_id))
    error_message = "repository_id is lowercase letters, digits and hyphens, starting with a letter."
  }
}

variable "keep_count" {
  description = "How many of the newest images the repository keeps."
  type        = number
  default     = 2

  validation {
    condition     = var.keep_count >= 1 && floor(var.keep_count) == var.keep_count
    error_message = "keep_count is a whole number of at least 1, or the running image could be deleted."
  }
}
