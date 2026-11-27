import type { Component } from 'svelte'

import AwardIcon from '@lucide/svelte/icons/award'
import BellIcon from '@lucide/svelte/icons/bell'
import BookOpenIcon from '@lucide/svelte/icons/book-open'
import BoxIcon from '@lucide/svelte/icons/box'
import BriefcaseIcon from '@lucide/svelte/icons/briefcase'
import BuildingIcon from '@lucide/svelte/icons/building'
import CalendarIcon from '@lucide/svelte/icons/calendar'
import CameraIcon from '@lucide/svelte/icons/camera'
import ClipboardListIcon from '@lucide/svelte/icons/clipboard-list'
import CoffeeIcon from '@lucide/svelte/icons/coffee'
import FileIcon from '@lucide/svelte/icons/file'
import FileTextIcon from '@lucide/svelte/icons/file-text'
import FolderIcon from '@lucide/svelte/icons/folder'
import GiftIcon from '@lucide/svelte/icons/gift'
import GlobeIcon from '@lucide/svelte/icons/globe'
import GraduationCapIcon from '@lucide/svelte/icons/graduation-cap'
import HandshakeIcon from '@lucide/svelte/icons/handshake'
import HeartIcon from '@lucide/svelte/icons/heart'
import HouseIcon from '@lucide/svelte/icons/house'
import ImageIcon from '@lucide/svelte/icons/image'
import ImagesIcon from '@lucide/svelte/icons/images'
import InfoIcon from '@lucide/svelte/icons/info'
import LayersIcon from '@lucide/svelte/icons/layers'
import LayoutGridIcon from '@lucide/svelte/icons/layout-grid'
import LinkIcon from '@lucide/svelte/icons/link'
import ListIcon from '@lucide/svelte/icons/list'
import MailIcon from '@lucide/svelte/icons/mail'
import MapIcon from '@lucide/svelte/icons/map'
import MapPinIcon from '@lucide/svelte/icons/map-pin'
import MegaphoneIcon from '@lucide/svelte/icons/megaphone'
import MessageSquareIcon from '@lucide/svelte/icons/message-square'
import NewspaperIcon from '@lucide/svelte/icons/newspaper'
import PackageIcon from '@lucide/svelte/icons/package'
import PenLineIcon from '@lucide/svelte/icons/pen-line'
import PhoneIcon from '@lucide/svelte/icons/phone'
import QuoteIcon from '@lucide/svelte/icons/quote'
import RssIcon from '@lucide/svelte/icons/rss'
import SettingsIcon from '@lucide/svelte/icons/settings'
import ShoppingBagIcon from '@lucide/svelte/icons/shopping-bag'
import StarIcon from '@lucide/svelte/icons/star'
import StoreIcon from '@lucide/svelte/icons/store'
import TagIcon from '@lucide/svelte/icons/tag'
import TicketIcon from '@lucide/svelte/icons/ticket'
import TrophyIcon from '@lucide/svelte/icons/trophy'
import UserIcon from '@lucide/svelte/icons/user'
import UsersIcon from '@lucide/svelte/icons/users'
import UtensilsIcon from '@lucide/svelte/icons/utensils'
import VideoIcon from '@lucide/svelte/icons/video'

export type Icon = Component<{ class?: string }>

/**
The Lucide icons a collection can name with `icon` in cms.config.json. Bundling all of Lucide would
add well over a thousand icons to the CMS, so only these are included; any other name falls back to
`file-text`.
*/
export const collectionIcons: Record<string, Icon> = {
	award: AwardIcon,
	bell: BellIcon,
	'book-open': BookOpenIcon,
	box: BoxIcon,
	briefcase: BriefcaseIcon,
	building: BuildingIcon,
	calendar: CalendarIcon,
	camera: CameraIcon,
	'clipboard-list': ClipboardListIcon,
	coffee: CoffeeIcon,
	file: FileIcon,
	'file-text': FileTextIcon,
	folder: FolderIcon,
	gift: GiftIcon,
	globe: GlobeIcon,
	'graduation-cap': GraduationCapIcon,
	handshake: HandshakeIcon,
	heart: HeartIcon,
	house: HouseIcon,
	image: ImageIcon,
	images: ImagesIcon,
	info: InfoIcon,
	layers: LayersIcon,
	'layout-grid': LayoutGridIcon,
	link: LinkIcon,
	list: ListIcon,
	mail: MailIcon,
	map: MapIcon,
	'map-pin': MapPinIcon,
	megaphone: MegaphoneIcon,
	'message-square': MessageSquareIcon,
	newspaper: NewspaperIcon,
	package: PackageIcon,
	'pen-line': PenLineIcon,
	phone: PhoneIcon,
	quote: QuoteIcon,
	rss: RssIcon,
	settings: SettingsIcon,
	'shopping-bag': ShoppingBagIcon,
	star: StarIcon,
	store: StoreIcon,
	tag: TagIcon,
	ticket: TicketIcon,
	trophy: TrophyIcon,
	user: UserIcon,
	users: UsersIcon,
	utensils: UtensilsIcon,
	video: VideoIcon,
}

export const defaultCollectionIcon: Icon = FileTextIcon

export function collectionIcon(name: string | undefined): Icon {
	return name !== undefined && Object.hasOwn(collectionIcons, name) ? collectionIcons[name] : defaultCollectionIcon
}
