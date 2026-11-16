import * as Calendar from "@ras/calendar/module"
import * as Global from "@ras/global/module"
import * as Mail from "@ras/mail/module"
import * as Memory from "@ras/memory/module"
import * as Work from "@ras/work/module"

/** Every module of ras, each after the modules whose services it calls. */
export const modules = [Global.module, Calendar.module, Work.module, Memory.module, Mail.module] as const
