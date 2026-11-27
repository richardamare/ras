variable "secret_ids" {
  description = "The ids of the secrets to create."
  type        = set(string)

  validation {
    condition     = alltrue([for id in var.secret_ids : can(regex("^[a-z][a-z0-9-]{0,254}$", id))])
    error_message = "Each secret id is lowercase letters, digits and hyphens, starting with a letter."
  }
}

variable "accessor" {
  description = "The service account member that reads every secret."
  type        = string

  validation {
    condition     = startswith(var.accessor, "serviceAccount:")
    error_message = "accessor is a service account member, such as serviceAccount:ras@project.iam.gserviceaccount.com."
  }
}
