<?php
/**
 * Plugin Name: Booking Calendar to Firestore (Robust Delete + User Sync)
 * Description: Syncs room availability, user booking status, and resilient delete behavior between WP Booking Calendar and Firestore.
 * Version: 16.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

// --- 1. CONFIGURATION -------------------------------------------------------
if ( ! defined( 'WPBC_FIREBASE_PROJECT_ID' ) ) {
	define( 'WPBC_FIREBASE_PROJECT_ID', 'marina-park-booking-app' );
}
if ( ! defined( 'WPBC_FIREBASE_KEY_PATH' ) ) {
	// Strongly recommended: override in wp-config.php with a path outside public web roots.
	define( 'WPBC_FIREBASE_KEY_PATH', __DIR__ . '/index.json' );
}
if ( ! defined( 'WPBC_FIREBASE_HTTP_TIMEOUT' ) ) {
	define( 'WPBC_FIREBASE_HTTP_TIMEOUT', 12 );
}
if ( ! defined( 'WPBC_FIREBASE_TOKEN_TRANSIENT' ) ) {
	define( 'WPBC_FIREBASE_TOKEN_TRANSIENT', 'wpbc_firestore_access_token_v1' );
}
if ( ! defined( 'WPBC_FIREBASE_ALLOW_INSECURE_KEY_PATH' ) ) {
	define( 'WPBC_FIREBASE_ALLOW_INSECURE_KEY_PATH', false );
}
if ( ! defined( 'WPBC_FIREBASE_DEBUG_LOGS' ) ) {
	define( 'WPBC_FIREBASE_DEBUG_LOGS', false );
}
// ---------------------------------------------------------------------------

// --- 2. CATEGORY MAPPING ---------------------------------------------------
function wpbc_get_category_map() {
	return array(
		// CATEGORY 2: QUADRUPLE ROOMS
		6  => '2',
		7  => '2',

		// CATEGORY 1: DOUBLE ROOMS
		8  => '1',
		9  => '1',
		10 => '1',
		11 => '1',
		12 => '1',
		13 => '1',

		// CATEGORY 3: BUNGALOWS
		14 => '3',
		17 => '3',
		18 => '3',
		19 => '3',
		20 => '3',
		21 => '3',
		22 => '3',

		// CATEGORY 4: SUPERIOR BUNGALOWS
		23 => '4',
		24 => '4',
		25 => '4',
		26 => '4',
		27 => '4',
		29 => '4',
		30 => '4',
	);
}

// --- 3. HOOKS --------------------------------------------------------------
add_action( 'wpbc_track_new_booking', 'wpbc_cat_sync_add', 10, 1 );
add_action( 'wpbc_restore_booking_from_trash', 'wpbc_cat_sync_restore', 10, 2 );

add_action( 'wpbc_delete_booking_completely', 'wpbc_cat_delete', 10, 2 );
add_action( 'wpbc_move_booking_to_trash', 'wpbc_cat_move_to_trash', 10, 2 );
add_action( 'wpbc_booking_delete', 'wpbc_cat_legacy_delete', 10, 1 );
add_action( 'wpbc_booking_trash', 'wpbc_cat_legacy_trash', 10, 2 );

// Approval/unapproval hooks vary by WPBC version.
add_action( 'wpbc_approve_booking', 'wpbc_cat_mark_approved', 10, 2 );
add_action( 'wpbc_booking_approved', 'wpbc_cat_mark_approved', 10, 2 );
add_action( 'wpbc_set_booking_approved', 'wpbc_cat_mark_approved', 10, 2 );

add_action( 'wpbc_unapprove_booking', 'wpbc_cat_mark_unapproved', 10, 2 );
add_action( 'wpbc_booking_unapproved', 'wpbc_cat_mark_unapproved', 10, 2 );
add_action( 'wpbc_set_booking_unapproved', 'wpbc_cat_mark_unapproved', 10, 2 );

// --- 4. ADD / UPDATE / RESTORE --------------------------------------------
function wpbc_cat_sync_add( $params ) {
	$booking_id = wpbc_extract_single_id( is_array( $params ) ? ( $params['booking_id'] ?? 0 ) : 0 );
	if ( ! $booking_id ) {
		return;
	}

	$details = wpbc_db_lookup( $booking_id );
	$resource_id = $details ? (int) $details['resource_id'] : (int) ( $params['resource_id'] ?? 0 );
	$dates = $details ? (string) $details['dates'] : (string) ( $params['str_dates__dd_mm_yyyy'] ?? '' );
	$approval = $details ? $details['approved'] : wpbc_normalize_approval_status( $params['approved'] ?? null );

	$category_id = wpbc_lookup_category( $resource_id );
	if ( $category_id && '' !== trim( $dates ) ) {
		wpbc_firestore_push( $booking_id, $category_id, (string) $resource_id, $dates );
	}

	wpbc_sync_order_and_user_status( $booking_id, $approval, 'add' );
}

function wpbc_cat_sync_restore( $params, $action_result ) {
	$ids = wpbc_extract_ids( is_array( $params ) ? ( $params['booking_id'] ?? '' ) : '' );
	foreach ( $ids as $booking_id ) {
		$details = wpbc_db_lookup( $booking_id );
		if ( $details ) {
			$category_id = wpbc_lookup_category( $details['resource_id'] );
			if ( $category_id ) {
				wpbc_firestore_push( $booking_id, $category_id, (string) $details['resource_id'], $details['dates'] );
			}
			wpbc_sync_order_and_user_status( $booking_id, $details['approved'], 'restore' );
			continue;
		}
		wpbc_sync_order_and_user_status( $booking_id, null, 'restore' );
	}
}

function wpbc_cat_mark_approved( $raw = null, $action_result = null ) {
	$ids = wpbc_extract_ids( $raw );
	foreach ( $ids as $booking_id ) {
		wpbc_sync_order_and_user_status( $booking_id, 'confirmed', 'approval_hook' );
	}
}

function wpbc_cat_mark_unapproved( $raw = null, $action_result = null ) {
	$ids = wpbc_extract_ids( $raw );
	foreach ( $ids as $booking_id ) {
		wpbc_sync_order_and_user_status( $booking_id, 'pending', 'approval_hook' );
	}
}

// --- 5. DELETE / TRASH -----------------------------------------------------
function wpbc_cat_delete( $params, $action_result ) {
	$ids = wpbc_extract_ids( is_array( $params ) ? ( $params['booking_id'] ?? '' ) : '' );
	wpbc_process_delete_list( $ids, 'delete_completely' );
}

function wpbc_cat_move_to_trash( $params, $action_result ) {
	$ids = wpbc_extract_ids( is_array( $params ) ? ( $params['booking_id'] ?? '' ) : '' );
	wpbc_process_delete_list( $ids, 'move_to_trash' );
}

function wpbc_cat_legacy_delete( $raw ) {
	$ids = wpbc_extract_ids( $raw );
	wpbc_process_delete_list( $ids, 'legacy_delete' );
}

function wpbc_cat_legacy_trash( $id, $is_trash ) {
	if ( $is_trash ) {
		wpbc_process_delete_list( array( (int) $id ), 'legacy_trash' );
		return;
	}
	$details = wpbc_db_lookup( (int) $id );
	if ( $details ) {
		$category_id = wpbc_lookup_category( $details['resource_id'] );
		if ( $category_id ) {
			wpbc_firestore_push( (int) $id, $category_id, (string) $details['resource_id'], $details['dates'] );
		}
		wpbc_sync_order_and_user_status( (int) $id, $details['approved'], 'legacy_restore' );
	}
}

function wpbc_process_delete_list( $ids, $delete_source = 'delete' ) {
	$ids = wpbc_extract_ids( $ids );
	if ( empty( $ids ) ) {
		return;
	}

	$access_token = wpbc_get_token();
	if ( ! $access_token ) {
		wpbc_log( 'Delete skipped: unable to get Firestore token.' );
		return;
	}

	foreach ( $ids as $booking_id ) {
		$booking_id = (int) $booking_id;
		if ( $booking_id <= 0 ) {
			continue;
		}

		$details = wpbc_db_lookup( $booking_id );
		$order = wpbc_firestore_get_order( $booking_id, $access_token );
		$approval = wpbc_resolve_approval_status( $details, $order );

		$removed_from_room = false;

		// 1) Best path: DB direct lookup.
		if ( $details ) {
			$category_id = wpbc_lookup_category( $details['resource_id'] );
			if ( $category_id ) {
				$removed_from_room = wpbc_firestore_remove(
					$booking_id,
					$category_id,
					(string) $details['resource_id'],
					$access_token
				);
			}
		}

		// 2) Fallback: Order direct hint (roomId + unitId).
		if ( ! $removed_from_room && is_array( $order ) ) {
			$hint_room = isset( $order['roomId'] ) ? trim( (string) $order['roomId'] ) : '';
			$hint_unit = isset( $order['unitId'] ) ? trim( (string) $order['unitId'] ) : '';
			if ( '' !== $hint_room && '' !== $hint_unit ) {
				$removed_from_room = wpbc_firestore_remove( $booking_id, $hint_room, $hint_unit, $access_token );
			}
		}

		// 3) Last resort: brute force across mapped units only.
		if ( ! $removed_from_room ) {
			$removed_from_room = wpbc_brute_force_delete( $booking_id, $access_token );
		}

		wpbc_apply_user_delete_policy( $booking_id, $approval, $order, $access_token, $delete_source );
		wpbc_sync_order_delete_metadata( $booking_id, $approval, $order, $access_token, $delete_source, $removed_from_room );
	}
}

function wpbc_apply_user_delete_policy( $booking_id, $approval, $order, $access_token, $delete_source ) {
	if ( ! is_array( $order ) ) {
		return;
	}
	$owner_uid = isset( $order['ownerUid'] ) ? trim( (string) $order['ownerUid'] ) : '';
	if ( '' === $owner_uid ) {
		return;
	}

	$user_doc_path = 'users/' . $owner_uid . '/bookings/' . $booking_id;
	$user_doc = wpbc_firestore_get_document( $user_doc_path, $access_token );

	if ( 'pending' === $approval ) {
		if ( is_array( $user_doc ) ) {
			wpbc_firestore_delete_document( $user_doc_path, $access_token );
		}
		return;
	}

	// Approved or unknown: preserve history, mark as cancelled.
	if ( ! is_array( $user_doc ) ) {
		return;
	}

	$decoded = wpbc_firestore_decode_fields( $user_doc );
	$current_status = strtolower( trim( (string) ( $decoded['status'] ?? '' ) ) );
	$current_wp_approval = strtolower( trim( (string) ( $decoded['wpApproval'] ?? '' ) ) );
	$target_wp_approval = $approval ? $approval : 'unknown';

	if ( 'cancelled' === $current_status && $current_wp_approval === $target_wp_approval ) {
		return;
	}

	$patch = array(
		'status'          => 'cancelled',
		'wpApproval'      => $target_wp_approval,
		'wpDeleteSource'  => (string) $delete_source,
		'wpSyncUpdatedAt' => gmdate( 'c' ),
		'updatedAt'       => gmdate( 'c' ),
	);

	wpbc_firestore_patch_plain_fields(
		$user_doc_path,
		$patch,
		$access_token,
		array( 'status', 'wpApproval', 'wpDeleteSource', 'wpSyncUpdatedAt', 'updatedAt' )
	);
}

function wpbc_sync_order_delete_metadata( $booking_id, $approval, $order, $access_token, $delete_source, $removed_from_room ) {
	$order_doc_path = 'orders/' . $booking_id;
	if ( ! is_array( $order ) ) {
		$order = wpbc_firestore_get_order( $booking_id, $access_token );
		if ( ! is_array( $order ) ) {
			return;
		}
	}

	$approval_value = $approval ? $approval : 'unknown';
	$current_status = strtolower( trim( (string) ( $order['status'] ?? '' ) ) );
	$current_wp_approval = strtolower( trim( (string) ( $order['wpApproval'] ?? '' ) ) );
	$current_delete_source = strtolower( trim( (string) ( $order['wpDeleteSource'] ?? '' ) ) );

	$new_delete_source = (string) $delete_source;
	$needs_update = ( 'cancelled' !== $current_status )
		|| ( $approval_value !== $current_wp_approval )
		|| ( strtolower( $new_delete_source ) !== $current_delete_source );

	if ( ! $needs_update ) {
		return;
	}

	$patch = array(
		'status'          => 'cancelled',
		'wpApproval'      => $approval_value,
		'wpDeleteSource'  => $new_delete_source,
		'wpSyncUpdatedAt' => gmdate( 'c' ),
		'roomSyncRemoved' => (bool) $removed_from_room,
	);

	wpbc_firestore_patch_plain_fields(
		$order_doc_path,
		$patch,
		$access_token,
		array( 'status', 'wpApproval', 'wpDeleteSource', 'wpSyncUpdatedAt', 'roomSyncRemoved' )
	);
}

// --- 6. ORDER/USER STATUS SYNC --------------------------------------------
function wpbc_sync_order_and_user_status( $booking_id, $approval, $sync_source = 'sync' ) {
	$booking_id = (int) $booking_id;
	if ( $booking_id <= 0 ) {
		return;
	}

	$access_token = wpbc_get_token();
	if ( ! $access_token ) {
		return;
	}

	$order = wpbc_firestore_get_order( $booking_id, $access_token );
	if ( ! is_array( $order ) ) {
		return;
	}

	$normalized_approval = wpbc_normalize_approval_status( $approval );
	if ( null === $normalized_approval ) {
		$normalized_approval = wpbc_normalize_approval_status( $order['wpApproval'] ?? null );
	}
	if ( null === $normalized_approval ) {
		return;
	}

	$current_wp_approval = strtolower( trim( (string) ( $order['wpApproval'] ?? '' ) ) );
	$patch_order = array(
		'wpApproval'      => $normalized_approval,
		'wpSyncUpdatedAt' => gmdate( 'c' ),
		'wpSyncSource'    => (string) $sync_source,
	);
	$mask = array( 'wpApproval', 'wpSyncUpdatedAt', 'wpSyncSource' );

	// If order had been cancelled but is now restored/re-approved, reopen status.
	$current_status = strtolower( trim( (string) ( $order['status'] ?? '' ) ) );
	if ( 'cancelled' === $current_status && ( 'restore' === $sync_source || 'legacy_restore' === $sync_source || 'approval_hook' === $sync_source ) ) {
		$patch_order['status'] = ( 'confirmed' === $normalized_approval ) ? 'confirmed' : 'pending';
		$mask[] = 'status';
	}

	if ( $current_wp_approval !== $normalized_approval || isset( $patch_order['status'] ) ) {
		wpbc_firestore_patch_plain_fields( 'orders/' . $booking_id, $patch_order, $access_token, $mask );
	}

	$owner_uid = isset( $order['ownerUid'] ) ? trim( (string) $order['ownerUid'] ) : '';
	if ( '' === $owner_uid ) {
		return;
	}

	$user_status = ( 'confirmed' === $normalized_approval ) ? 'confirmed' : 'pending';
	wpbc_upsert_user_booking_status( $booking_id, $owner_uid, $order, $user_status, $normalized_approval, $sync_source, $access_token );
}

function wpbc_upsert_user_booking_status( $booking_id, $owner_uid, $order, $user_status, $approval_status, $sync_source, $access_token ) {
	$user_doc_path = 'users/' . $owner_uid . '/bookings/' . $booking_id;
	$user_doc = wpbc_firestore_get_document( $user_doc_path, $access_token );
	$existing = is_array( $user_doc ) ? wpbc_firestore_decode_fields( $user_doc ) : array();

	$current_status = strtolower( trim( (string) ( $existing['status'] ?? '' ) ) );
	$current_approval = strtolower( trim( (string) ( $existing['wpApproval'] ?? '' ) ) );

	if ( $current_status === $user_status && $current_approval === $approval_status ) {
		return;
	}

	$dates = '';
	if ( ! empty( $order['startDate'] ) && ! empty( $order['endDate'] ) ) {
		$dates = (string) $order['startDate'] . ' - ' . (string) $order['endDate'];
	}

	$payload = array(
		'bookingId'       => (string) $booking_id,
		'status'          => (string) $user_status,
		'wpApproval'      => (string) $approval_status,
		'wpSyncSource'    => (string) $sync_source,
		'wpSyncUpdatedAt' => gmdate( 'c' ),
		'updatedAt'       => gmdate( 'c' ),
	);

	if ( '' !== $dates && empty( $existing['dates'] ) ) {
		$payload['dates'] = $dates;
	}
	if ( isset( $order['itemTitle'] ) && '' !== trim( (string) $order['itemTitle'] ) && empty( $existing['itemTitle'] ) ) {
		$payload['itemTitle'] = (string) $order['itemTitle'];
	}
	if ( isset( $order['unitName'] ) && '' !== trim( (string) $order['unitName'] ) && empty( $existing['unitName'] ) ) {
		$payload['unitName'] = (string) $order['unitName'];
	}
	if ( isset( $order['nights'] ) && '' !== (string) $order['nights'] && empty( $existing['nights'] ) ) {
		$payload['nights'] = (int) $order['nights'];
	}
	if ( isset( $order['totalPrice'] ) && '' !== (string) $order['totalPrice'] && empty( $existing['totalPrice'] ) ) {
		$payload['totalPrice'] = (int) $order['totalPrice'];
	}
	if ( ! empty( $order['guests'] ) && empty( $existing['guests'] ) ) {
		$payload['guests'] = $order['guests'];
	}
	if ( empty( $existing['createdAt'] ) ) {
		$payload['createdAt'] = ! empty( $order['createdAt'] ) ? (string) $order['createdAt'] : gmdate( 'c' );
	}

	wpbc_firestore_patch_plain_fields( $user_doc_path, $payload, $access_token, array_keys( $payload ) );
}

// --- 7. FIRESTORE ROOM SYNC ------------------------------------------------
function wpbc_firestore_push( $booking_id, $category_id, $unit_id, $dates_str, $access_token = '' ) {
	if ( '' === $access_token ) {
		$access_token = wpbc_get_token();
	}
	if ( ! $access_token ) {
		return false;
	}

	$range = wpbc_dates_to_range( $dates_str );
	if ( ! $range || empty( $range['start'] ) || empty( $range['end'] ) ) {
		wpbc_log( 'Skipping push: invalid date range for booking #' . (int) $booking_id );
		return false;
	}

	$booking_map = array(
		'mapValue' => array(
			'fields' => array(
				'id'    => array( 'integerValue' => (string) (int) $booking_id ),
				'start' => array( 'stringValue'  => (string) $range['start'] ),
				'end'   => array( 'stringValue'  => (string) $range['end'] ),
			),
		),
	);

	$document_path = 'projects/' . WPBC_FIREBASE_PROJECT_ID . '/databases/(default)/documents/rooms/' . $category_id . '/units/' . $unit_id;
	$payload = array(
		'writes' => array(
			array(
				'transform' => array(
					'document'        => $document_path,
					'fieldTransforms' => array(
						array(
							'fieldPath'             => 'bookings',
							'appendMissingElements' => array( 'values' => array( $booking_map ) ),
						),
					),
				),
			),
		),
	);

	$url = 'https://firestore.googleapis.com/v1/projects/' . rawurlencode( WPBC_FIREBASE_PROJECT_ID ) . '/databases/(default)/documents:commit';
	$response = wpbc_firestore_request( 'POST', $url, $access_token, $payload );
	return ( is_array( $response ) && (int) $response['code'] >= 200 && (int) $response['code'] < 300 );
}

function wpbc_firestore_remove( $booking_id, $category_id, $unit_id, $access_token = '' ) {
	if ( '' === $access_token ) {
		$access_token = wpbc_get_token();
	}
	if ( ! $access_token ) {
		return false;
	}

	$doc_path = 'rooms/' . $category_id . '/units/' . $unit_id;
	$doc = wpbc_firestore_get_document( $doc_path, $access_token );
	if ( ! is_array( $doc ) ) {
		return false;
	}

	$current_values = array();
	if ( isset( $doc['fields']['bookings']['arrayValue']['values'] ) && is_array( $doc['fields']['bookings']['arrayValue']['values'] ) ) {
		$current_values = $doc['fields']['bookings']['arrayValue']['values'];
	}

	$new_values = array();
	$found = false;
	foreach ( $current_values as $entry ) {
		$entry_id = wpbc_firestore_extract_booking_id_from_value( $entry );
		if ( $entry_id === (int) $booking_id ) {
			$found = true;
			continue;
		}
		$new_values[] = $entry;
	}

	if ( ! $found ) {
		return false;
	}

	$fields = array(
		'bookings' => array(
			'arrayValue' => array(
				'values' => array_values( $new_values ),
			),
		),
	);

	return wpbc_firestore_patch_encoded_fields( $doc_path, $fields, $access_token, array( 'bookings' ) );
}

function wpbc_brute_force_delete( $booking_id, $access_token ) {
	$map = wpbc_get_category_map();
	foreach ( $map as $unit_id => $category_id ) {
		if ( wpbc_firestore_remove( $booking_id, (string) $category_id, (string) $unit_id, $access_token ) ) {
			return true;
		}
	}
	return false;
}

// --- 8. FIRESTORE DOCUMENT HELPERS ----------------------------------------
function wpbc_firestore_get_order( $booking_id, $access_token = '' ) {
	$doc = wpbc_firestore_get_document( 'orders/' . (int) $booking_id, $access_token );
	if ( ! is_array( $doc ) ) {
		return false;
	}
	return wpbc_firestore_decode_fields( $doc );
}

function wpbc_firestore_get_document( $doc_path, $access_token = '' ) {
	if ( '' === $access_token ) {
		$access_token = wpbc_get_token();
	}
	if ( ! $access_token ) {
		return false;
	}

	$url = wpbc_firestore_document_url( $doc_path );
	$response = wpbc_firestore_request( 'GET', $url, $access_token, null );
	if ( ! is_array( $response ) ) {
		return false;
	}
	$code = (int) $response['code'];
	if ( 200 === $code ) {
		return is_array( $response['body'] ) ? $response['body'] : array();
	}
	if ( 404 === $code ) {
		return false;
	}
	wpbc_log( 'Firestore GET failed for ' . $doc_path . ' with code ' . $code );
	return false;
}

function wpbc_firestore_delete_document( $doc_path, $access_token = '' ) {
	if ( '' === $access_token ) {
		$access_token = wpbc_get_token();
	}
	if ( ! $access_token ) {
		return false;
	}

	$url = wpbc_firestore_document_url( $doc_path );
	$response = wpbc_firestore_request( 'DELETE', $url, $access_token, null );
	if ( ! is_array( $response ) ) {
		return false;
	}
	$code = (int) $response['code'];
	return ( $code >= 200 && $code < 300 ) || 404 === $code;
}

function wpbc_firestore_patch_plain_fields( $doc_path, $plain_fields, $access_token, $update_mask_fields ) {
	$encoded_fields = array();
	foreach ( $plain_fields as $key => $value ) {
		$encoded_fields[ $key ] = wpbc_firestore_encode_value( $value );
	}
	return wpbc_firestore_patch_encoded_fields( $doc_path, $encoded_fields, $access_token, $update_mask_fields );
}

function wpbc_firestore_patch_encoded_fields( $doc_path, $encoded_fields, $access_token, $update_mask_fields ) {
	if ( empty( $encoded_fields ) ) {
		return true;
	}

	$url = wpbc_firestore_document_url( $doc_path, $update_mask_fields );
	$payload = array( 'fields' => $encoded_fields );
	$response = wpbc_firestore_request( 'PATCH', $url, $access_token, $payload );
	if ( ! is_array( $response ) ) {
		return false;
	}
	$code = (int) $response['code'];
	if ( $code >= 200 && $code < 300 ) {
		return true;
	}
	wpbc_log( 'Firestore PATCH failed for ' . $doc_path . ' with code ' . $code );
	return false;
}

function wpbc_firestore_document_url( $doc_path, $update_mask_fields = array() ) {
	$base = 'https://firestore.googleapis.com/v1/projects/' . rawurlencode( WPBC_FIREBASE_PROJECT_ID ) . '/databases/(default)/documents';
	$encoded_path = wpbc_firestore_encode_doc_path( $doc_path );
	$url = $base . '/' . $encoded_path;

	if ( ! empty( $update_mask_fields ) ) {
		$parts = array();
		foreach ( $update_mask_fields as $field_path ) {
			$parts[] = 'updateMask.fieldPaths=' . rawurlencode( (string) $field_path );
		}
		$url .= '?' . implode( '&', $parts );
	}

	return $url;
}

function wpbc_firestore_encode_doc_path( $path ) {
	$segments = explode( '/', trim( (string) $path, '/' ) );
	$segments = array_filter( array_map( 'trim', $segments ), static function ( $segment ) {
		return '' !== $segment;
	} );
	$segments = array_map( 'rawurlencode', $segments );
	return implode( '/', $segments );
}

function wpbc_firestore_extract_booking_id_from_value( $value ) {
	if ( ! is_array( $value ) || empty( $value['mapValue']['fields']['id'] ) ) {
		return 0;
	}
	$id_field = $value['mapValue']['fields']['id'];
	if ( isset( $id_field['integerValue'] ) ) {
		return (int) $id_field['integerValue'];
	}
	if ( isset( $id_field['stringValue'] ) ) {
		return (int) $id_field['stringValue'];
	}
	return 0;
}

function wpbc_firestore_decode_fields( $doc ) {
	$result = array();
	$fields = isset( $doc['fields'] ) && is_array( $doc['fields'] ) ? $doc['fields'] : array();
	foreach ( $fields as $field_name => $field_value ) {
		$result[ $field_name ] = wpbc_firestore_decode_value( $field_value );
	}
	return $result;
}

function wpbc_firestore_decode_value( $value ) {
	if ( ! is_array( $value ) ) {
		return null;
	}
	if ( isset( $value['nullValue'] ) ) {
		return null;
	}
	if ( isset( $value['stringValue'] ) ) {
		return (string) $value['stringValue'];
	}
	if ( isset( $value['integerValue'] ) ) {
		return (int) $value['integerValue'];
	}
	if ( isset( $value['doubleValue'] ) ) {
		return (float) $value['doubleValue'];
	}
	if ( isset( $value['booleanValue'] ) ) {
		return (bool) $value['booleanValue'];
	}
	if ( isset( $value['timestampValue'] ) ) {
		return (string) $value['timestampValue'];
	}
	if ( isset( $value['arrayValue']['values'] ) && is_array( $value['arrayValue']['values'] ) ) {
		$list = array();
		foreach ( $value['arrayValue']['values'] as $item ) {
			$list[] = wpbc_firestore_decode_value( $item );
		}
		return $list;
	}
	if ( isset( $value['mapValue']['fields'] ) && is_array( $value['mapValue']['fields'] ) ) {
		$map = array();
		foreach ( $value['mapValue']['fields'] as $k => $v ) {
			$map[ $k ] = wpbc_firestore_decode_value( $v );
		}
		return $map;
	}
	return null;
}

function wpbc_firestore_encode_value( $value ) {
	if ( null === $value ) {
		return array( 'nullValue' => null );
	}
	if ( is_bool( $value ) ) {
		return array( 'booleanValue' => $value );
	}
	if ( is_int( $value ) ) {
		return array( 'integerValue' => (string) $value );
	}
	if ( is_float( $value ) ) {
		return array( 'doubleValue' => $value );
	}
	if ( is_string( $value ) ) {
		return array( 'stringValue' => $value );
	}
	if ( is_array( $value ) ) {
		$is_list = array_keys( $value ) === range( 0, count( $value ) - 1 );
		if ( $is_list ) {
			$items = array();
			foreach ( $value as $item ) {
				$items[] = wpbc_firestore_encode_value( $item );
			}
			return array( 'arrayValue' => array( 'values' => $items ) );
		}
		$fields = array();
		foreach ( $value as $k => $v ) {
			$fields[ $k ] = wpbc_firestore_encode_value( $v );
		}
		return array( 'mapValue' => array( 'fields' => $fields ) );
	}
	return array( 'stringValue' => (string) $value );
}

function wpbc_firestore_request( $method, $url, $access_token, $body = null ) {
	$args = array(
		'method'      => strtoupper( (string) $method ),
		'timeout'     => (int) WPBC_FIREBASE_HTTP_TIMEOUT,
		'redirection' => 0,
		'sslverify'   => true,
		'headers'     => array(
			'Authorization' => 'Bearer ' . $access_token,
			'Accept'        => 'application/json',
		),
	);
	if ( null !== $body ) {
		$args['headers']['Content-Type'] = 'application/json';
		$args['body'] = wp_json_encode( $body );
	}

	$response = wp_remote_request( $url, $args );
	if ( is_wp_error( $response ) ) {
		wpbc_log( 'HTTP error: ' . $response->get_error_message() );
		return false;
	}

	$code = (int) wp_remote_retrieve_response_code( $response );
	$raw_body = (string) wp_remote_retrieve_body( $response );
	$decoded = array();
	if ( '' !== trim( $raw_body ) ) {
		$tmp = json_decode( $raw_body, true );
		if ( is_array( $tmp ) ) {
			$decoded = $tmp;
		}
	}

	return array(
		'code' => $code,
		'body' => $decoded,
		'raw'  => $raw_body,
	);
}

// --- 9. APPROVAL / STATUS HELPERS -----------------------------------------
function wpbc_resolve_approval_status( $details, $order ) {
	if ( is_array( $details ) && isset( $details['approved'] ) && null !== $details['approved'] ) {
		return $details['approved'];
	}

	if ( is_array( $order ) ) {
		$order_wp_approval = wpbc_normalize_approval_status( $order['wpApproval'] ?? null );
		if ( null !== $order_wp_approval ) {
			return $order_wp_approval;
		}

		$order_status = strtolower( trim( (string) ( $order['status'] ?? '' ) ) );
		if ( in_array( $order_status, array( 'approved', 'confirmed' ), true ) ) {
			return 'confirmed';
		}
		if ( in_array( $order_status, array( 'pending', 'unapproved', 'awaiting_approval' ), true ) ) {
			return 'pending';
		}
	}

	return null;
}

function wpbc_normalize_approval_status( $value ) {
	if ( null === $value || '' === $value ) {
		return null;
	}

	if ( is_bool( $value ) ) {
		return $value ? 'confirmed' : 'pending';
	}

	if ( is_numeric( $value ) ) {
		return ( (int) $value > 0 ) ? 'confirmed' : 'pending';
	}

	$normalized = strtolower( trim( (string) $value ) );
	if ( '' === $normalized ) {
		return null;
	}

	if ( in_array( $normalized, array( '1', 'yes', 'true', 'approved', 'confirmat', 'confirmed' ), true ) ) {
		return 'confirmed';
	}
	if ( in_array( $normalized, array( '0', 'no', 'false', 'pending', 'unapproved', 'awaiting_approval', 'in asteptare' ), true ) ) {
		return 'pending';
	}

	return null;
}

// --- 10. WP DATABASE HELPERS ----------------------------------------------
function wpbc_lookup_category( $resource_id ) {
	$resource_id = (int) $resource_id;
	$map = wpbc_get_category_map();
	return isset( $map[ $resource_id ] ) ? $map[ $resource_id ] : false;
}

function wpbc_db_lookup( $booking_id ) {
	global $wpdb;
	$booking_id = (int) $booking_id;
	if ( $booking_id <= 0 ) {
		return false;
	}

	$row = $wpdb->get_row(
		$wpdb->prepare(
			"SELECT * FROM {$wpdb->prefix}booking WHERE booking_id = %d",
			$booking_id
		),
		ARRAY_A
	);
	if ( ! is_array( $row ) ) {
		return false;
	}

	$resource_id = isset( $row['booking_type'] ) ? (int) $row['booking_type'] : 0;
	if ( $resource_id <= 0 ) {
		return false;
	}

	$approved_raw = null;
	if ( array_key_exists( 'approved', $row ) ) {
		$approved_raw = $row['approved'];
	} elseif ( array_key_exists( 'is_new', $row ) ) {
		// Some WPBC versions expose "is_new" instead of approved.
		$approved_raw = ( (int) $row['is_new'] > 0 ) ? 0 : 1;
	}

	$date_rows = $wpdb->get_col(
		$wpdb->prepare(
			"SELECT booking_date FROM {$wpdb->prefix}bookingdates WHERE booking_id = %d",
			$booking_id
		)
	);
	if ( empty( $date_rows ) ) {
		return false;
	}

	$formatted = array();
	foreach ( $date_rows as $raw_date ) {
		try {
			$formatted[] = ( new DateTime( $raw_date ) )->format( 'd.m.Y' );
		} catch ( Exception $e ) {
			// Ignore invalid rows.
		}
	}
	if ( empty( $formatted ) ) {
		return false;
	}

	return array(
		'resource_id' => $resource_id,
		'dates'       => implode( ', ', $formatted ),
		'approved'    => wpbc_normalize_approval_status( $approved_raw ),
	);
}

function wpbc_dates_to_range( $dates_str ) {
	$dates_str = (string) $dates_str;
	$parts = explode( ',', $dates_str );
	$normalized = array();

	foreach ( $parts as $part ) {
		$part = trim( (string) $part );
		if ( '' === $part ) {
			continue;
		}

		$dt = DateTime::createFromFormat( 'd.m.Y', $part );
		if ( ! $dt ) {
			$dt = DateTime::createFromFormat( 'Y-m-d', $part );
		}
		if ( ! $dt ) {
			$dt = DateTime::createFromFormat( 'Y-m-d H:i:s', $part );
		}
		if ( ! $dt ) {
			continue;
		}

		$normalized[] = $dt->format( 'Y-m-d' );
	}

	if ( empty( $normalized ) ) {
		return false;
	}

	sort( $normalized, SORT_STRING );
	return array(
		'start' => $normalized[0],
		'end'   => $normalized[ count( $normalized ) - 1 ],
	);
}

function wpbc_extract_single_id( $raw ) {
	$ids = wpbc_extract_ids( $raw );
	if ( empty( $ids ) ) {
		return 0;
	}
	return (int) $ids[0];
}

function wpbc_extract_ids( $raw ) {
	if ( is_null( $raw ) ) {
		return array();
	}

	if ( is_object( $raw ) ) {
		$raw = (array) $raw;
	}

	if ( is_array( $raw ) ) {
		if ( isset( $raw['booking_id'] ) ) {
			return wpbc_extract_ids( $raw['booking_id'] );
		}
		if ( isset( $raw['id'] ) && is_numeric( $raw['id'] ) ) {
			return array( (int) $raw['id'] );
		}
		$is_numeric_list = array_keys( $raw ) === range( 0, count( $raw ) - 1 );
		if ( $is_numeric_list ) {
			$list = array();
			foreach ( $raw as $item ) {
				if ( is_numeric( $item ) ) {
					$list[] = (int) $item;
				} else {
					$list = array_merge( $list, wpbc_extract_ids( $item ) );
				}
			}
			$list = array_values( array_unique( array_filter( array_map( 'intval', $list ) ) ) );
			return $list;
		}
		return array();
	}

	if ( is_numeric( $raw ) ) {
		$id = (int) $raw;
		return $id > 0 ? array( $id ) : array();
	}

	$raw = trim( (string) $raw );
	if ( '' === $raw ) {
		return array();
	}

	$parts = preg_split( '/\s*,\s*/', $raw );
	$ids = array();
	foreach ( $parts as $part ) {
		if ( is_numeric( $part ) ) {
			$ids[] = (int) $part;
		}
	}
	$ids = array_values( array_unique( array_filter( array_map( 'intval', $ids ) ) ) );
	return $ids;
}

// --- 11. TOKEN / AUTH ------------------------------------------------------
function wpbc_get_token() {
	static $runtime_cache = null;
	static $runtime_expiry = 0;

	$now = time();
	if ( is_string( $runtime_cache ) && '' !== $runtime_cache && $runtime_expiry > ( $now + 30 ) ) {
		return $runtime_cache;
	}

	$transient = get_transient( WPBC_FIREBASE_TOKEN_TRANSIENT );
	if ( is_array( $transient ) && ! empty( $transient['token'] ) && ! empty( $transient['expires_at'] ) ) {
		if ( (int) $transient['expires_at'] > ( $now + 30 ) ) {
			$runtime_cache = (string) $transient['token'];
			$runtime_expiry = (int) $transient['expires_at'];
			return $runtime_cache;
		}
	}

	$key_path = wpbc_get_validated_key_path();
	if ( ! $key_path ) {
		wpbc_log( 'Token fetch failed: invalid key path.' );
		return false;
	}

	$key_json = file_get_contents( $key_path );
	if ( false === $key_json ) {
		wpbc_log( 'Token fetch failed: unable to read key file.' );
		return false;
	}

	$key = json_decode( $key_json, true );
	if ( ! is_array( $key ) || empty( $key['private_key'] ) || empty( $key['client_email'] ) ) {
		wpbc_log( 'Token fetch failed: invalid key JSON structure.' );
		return false;
	}

	$header = wpbc_base64url_encode( wp_json_encode( array( 'alg' => 'RS256', 'typ' => 'JWT' ) ) );
	$issued_at = time();
	$claim = wpbc_base64url_encode(
		wp_json_encode(
			array(
				'iss'   => $key['client_email'],
				'scope' => 'https://www.googleapis.com/auth/datastore',
				'aud'   => 'https://oauth2.googleapis.com/token',
				'exp'   => $issued_at + 3600,
				'iat'   => $issued_at,
			)
		)
	);

	$unsigned = $header . '.' . $claim;
	$signature = '';
	$signed = openssl_sign( $unsigned, $signature, $key['private_key'], 'SHA256' );
	if ( ! $signed ) {
		wpbc_log( 'Token fetch failed: openssl_sign failed.' );
		return false;
	}

	$jwt = $unsigned . '.' . wpbc_base64url_encode( $signature );

	$response = wp_remote_post(
		'https://oauth2.googleapis.com/token',
		array(
			'timeout'   => (int) WPBC_FIREBASE_HTTP_TIMEOUT,
			'sslverify' => true,
			'body'      => array(
				'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
				'assertion'  => $jwt,
			),
		)
	);
	if ( is_wp_error( $response ) ) {
		wpbc_log( 'Token fetch failed: ' . $response->get_error_message() );
		return false;
	}

	$body = json_decode( wp_remote_retrieve_body( $response ), true );
	$token = is_array( $body ) && ! empty( $body['access_token'] ) ? (string) $body['access_token'] : '';
	$expires_in = is_array( $body ) && ! empty( $body['expires_in'] ) ? (int) $body['expires_in'] : 3600;
	if ( '' === $token ) {
		wpbc_log( 'Token fetch failed: access_token missing in response.' );
		return false;
	}

	$expiry = time() + max( 60, $expires_in - 120 );
	$runtime_cache = $token;
	$runtime_expiry = $expiry;
	set_transient(
		WPBC_FIREBASE_TOKEN_TRANSIENT,
		array(
			'token'      => $token,
			'expires_at' => $expiry,
		),
		max( 60, $expires_in - 120 )
	);

	return $token;
}

function wpbc_get_validated_key_path() {
	$path = (string) WPBC_FIREBASE_KEY_PATH;
	if ( '' === trim( $path ) ) {
		return false;
	}
	$real = realpath( $path );
	if ( ! $real || ! is_readable( $real ) ) {
		return false;
	}

	if ( ! WPBC_FIREBASE_ALLOW_INSECURE_KEY_PATH ) {
		$plugin_dir = realpath( WP_PLUGIN_DIR );
		if ( $plugin_dir && 0 === strpos( $real, $plugin_dir ) ) {
			wpbc_log( 'Refusing insecure key path inside plugin directory.' );
			return false;
		}
	}

	return $real;
}

function wpbc_base64url_encode( $raw ) {
	return rtrim( strtr( base64_encode( $raw ), '+/', '-_' ), '=' );
}

// --- 12. LOGGING -----------------------------------------------------------
function wpbc_log( $message ) {
	if ( WPBC_FIREBASE_DEBUG_LOGS ) {
		error_log( '[WPBC Firestore Sync] ' . (string) $message );
	}
}

