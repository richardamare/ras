variable "project_id" {
  description = "The project that holds the uptime check."
  type        = string
}

variable "billing_account" {
  description = "The id of the billing account the budget watches."
  type        = string

  validation {
    condition     = can(regex("^[0-9A-F]{6}-[0-9A-F]{6}-[0-9A-F]{6}$", var.billing_account))
    error_message = "billing_account is the bare id, such as 000000-AAAAAA-111111."
  }
}

variable "budget" {
  description = "The month's amount, in the billing account's currency, past which the owner gets an email."
  type        = number
  default     = 120

  validation {
    condition     = var.budget > 0 && floor(var.budget) == var.budget
    error_message = "budget is a whole amount above zero."
  }
}

variable "currency" {
  description = "The billing account's currency."
  type        = string
  default     = "CZK"
}

variable "email" {
  description = "The address the alerts go to."
  type        = string

  validation {
    condition     = can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", var.email))
    error_message = "email is an address, such as owner@example.com."
  }
}

variable "host" {
  description = "The host the uptime check calls, without a scheme."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9.-]+$", var.host))
    error_message = "host is a bare host name, such as ras.example.com."
  }
}
