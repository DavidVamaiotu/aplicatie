<?php
/**
 * Plugin Name: Add booking API
 * Description: Connects Vite app to Booking Calendar plugin.
 * Version: 1.5
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Optional wp-config.php constants:
 *
 * define('WPBC_CUSTOM_HMAC_SECRET', 'your-shared-secret');
 * define('WPBC_CUSTOM_REQUIRE_SIGNATURE', true); // default: true if secret exists, false if missing
 * define('WPBC_CUSTOM_ALLOWED_ORIGINS', 'https://your-site.com,capacitor://localhost,http://localhost');
 *
 * Optional form field key mapping:
 * define('WPBC_CUSTOM_FIELD_ADULTS', 'adults');
 * define('WPBC_CUSTOM_FIELD_CHILDREN', 'children');
 * define('WPBC_CUSTOM_FIELD_LICENSE_PLATE', 'license_plate');
 * define('WPBC_CUSTOM_FIELD_DATE_RANGE', 'date_range');
 */

function my_custom_wpbc_get_hmac_secret() {
	if ( defined( 'WPBC_CUSTOM_HMAC_SECRET' ) && WPBC_CUSTOM_HMAC_SECRET ) {
		return (string) WPBC_CUSTOM_HMAC_SECRET;
	}
	$env_secret = getenv( 'WPBC_CUSTOM_HMAC_SECRET' );
	return $env_secret ? (string) $env_secret : '';
}

function my_custom_wpbc_signature_required() {
	if ( defined( 'WPBC_CUSTOM_REQUIRE_SIGNATURE' ) ) {
		return (bool) WPBC_CUSTOM_REQUIRE_SIGNATURE;
	}
	return my_custom_wpbc_get_hmac_secret() !== '';
}

function my_custom_wpbc_get_field_key( $constant_name, $default_key ) {
	if ( defined( $constant_name ) ) {
		$value = sanitize_key( (string) constant( $constant_name ) );
		if ( '' !== $value ) {
			return $value;
		}
	}
	return $default_key;
}

function my_custom_wpbc_permission( WP_REST_Request $request ) {
	if ( 'OPTIONS' === $request->get_method() ) {
		return true;
	}

	$secret  = my_custom_wpbc_get_hmac_secret();
	$require = my_custom_wpbc_signature_required();

	if ( ! $require && '' === $secret ) {
		return true;
	}

	if ( '' === $secret ) {
		return new WP_Error(
			'config_error',
			'Booking API signature required but secret is not configured.',
			array( 'status' => 500 )
		);
	}

	$timestamp = trim( (string) $request->get_header( 'x-marina-timestamp' ) );
	$signature = trim( (string) $request->get_header( 'x-marina-signature' ) );

	if ( '' === $timestamp || '' === $signature ) {
		return new WP_Error( 'forbidden', 'Missing signature headers.', array( 'status' => 403 ) );
	}

	if ( ! ctype_digit( $timestamp ) ) {
		return new WP_Error( 'forbidden', 'Invalid signature timestamp.', array( 'status' => 403 ) );
	}

	$ts = (int) $timestamp;
	if ( abs( time() - $ts ) > 300 ) {
		return new WP_Error( 'forbidden', 'Signature timestamp expired.', array( 'status' => 403 ) );
	}

	$raw_body = (string) $request->get_body();
	$expected = 'sha256=' . hash_hmac( 'sha256', $timestamp . '.' . $raw_body, $secret );

	if ( ! hash_equals( $expected, $signature ) ) {
		return new WP_Error( 'forbidden', 'Invalid request signature.', array( 'status' => 403 ) );
	}

	return true;
}

function my_custom_wpbc_load_dev_api() {
	if ( function_exists( 'wpbc_api_booking_add_new' ) ) {
		return true;
	}

	$candidates = array(
		WP_PLUGIN_DIR . '/booking/core/wpbc-dev-api.php',
		WP_PLUGIN_DIR . '/booking-calendar/core/wpbc-dev-api.php',
	);

	foreach ( $candidates as $path ) {
		if ( file_exists( $path ) ) {
			require_once $path;
			break;
		}
	}

	return function_exists( 'wpbc_api_booking_add_new' );
}

function my_custom_wpbc_extract_booking_id( $result ) {
	if ( is_numeric( $result ) ) {
		return (int) $result;
	}

	if ( is_array( $result ) ) {
		foreach ( array( 'booking_id', 'id', 'booking', 'id_booking' ) as $key ) {
			if ( isset( $result[ $key ] ) && is_numeric( $result[ $key ] ) ) {
				return (int) $result[ $key ];
			}
		}
	}

	if ( is_object( $result ) ) {
		foreach ( array( 'booking_id', 'id', 'booking', 'id_booking' ) as $key ) {
			if ( isset( $result->$key ) && is_numeric( $result->$key ) ) {
				return (int) $result->$key;
			}
		}
	}

	return null;
}

function my_custom_wpbc_normalize_date_value( $value ) {
	$date = trim( (string) $value );
	if ( '' === $date ) {
		return '';
	}
	$date = str_replace( 'T', ' ', $date );
	$date = preg_replace( '/\s+/', ' ', $date );
	return trim( (string) $date );
}

function my_custom_wpbc_validate_date_value( $date ) {
	return (bool) preg_match( '/^[0-9]{4}-[0-9]{2}-[0-9]{2}(?: [0-9]{2}:[0-9]{2}:[0-9]{2})?$/', $date );
}

function my_custom_wpbc_handler( WP_REST_Request $request ) {
	if ( ! my_custom_wpbc_load_dev_api() ) {
		return new WP_Error(
			'system_error',
			'Booking API file not found on server.',
			array( 'status' => 500 )
		);
	}

	$params = $request->get_json_params();
	if ( ! is_array( $params ) ) {
		return new WP_Error( 'invalid_payload', 'Invalid JSON payload.', array( 'status' => 400 ) );
	}

	$raw_dates = isset( $params['dates'] ) && is_array( $params['dates'] ) ? array_values( $params['dates'] ) : array();
	if ( empty( $raw_dates ) ) {
		return new WP_Error( 'invalid_payload', 'dates is required and must be a non-empty array.', array( 'status' => 400 ) );
	}

	$dates = array();
	foreach ( $raw_dates as $raw_date ) {
		$normalized_date = my_custom_wpbc_normalize_date_value( $raw_date );
		if ( '' === $normalized_date || ! my_custom_wpbc_validate_date_value( $normalized_date ) ) {
			return new WP_Error( 'invalid_payload', 'Invalid date format in dates array.', array( 'status' => 400 ) );
		}
		$dates[] = $normalized_date;
	}

	$first_name = sanitize_text_field( (string) ( $params['name'] ?? '' ) );
	$last_name  = sanitize_text_field( (string) ( $params['last_name'] ?? '' ) );
	$email      = sanitize_email( (string) ( $params['email'] ?? '' ) );
	$phone      = sanitize_text_field( (string) ( $params['phone'] ?? '' ) );

	if ( '' === $first_name || '' === $last_name || '' === $email || '' === $phone ) {
		return new WP_Error( 'invalid_payload', 'name, last_name, email and phone are required.', array( 'status' => 400 ) );
	}

	if ( ! is_email( $email ) ) {
		return new WP_Error( 'invalid_payload', 'email is invalid.', array( 'status' => 400 ) );
	}

	$resource_id = isset( $params['resource_id'] ) ? absint( $params['resource_id'] ) : 0;
	if ( $resource_id <= 0 ) {
		return new WP_Error( 'invalid_payload', 'resource_id must be a positive integer.', array( 'status' => 400 ) );
	}

	$time_range_value = '';
	if ( ! empty( $params['time'] ) ) {
		$time_range_value = sanitize_text_field( (string) $params['time'] );
	} elseif ( ! empty( $params['check_in'] ) && ! empty( $params['check_out'] ) ) {
		$check_in         = sanitize_text_field( (string) $params['check_in'] );
		$check_out        = sanitize_text_field( (string) $params['check_out'] );
		$time_range_value = $check_in . ' - ' . $check_out;
	}

	if ( '' !== $time_range_value && ! preg_match( '/^[0-9]{2}:[0-9]{2} - [0-9]{2}:[0-9]{2}$/', $time_range_value ) ) {
		return new WP_Error( 'invalid_payload', 'time must be in HH:MM - HH:MM format.', array( 'status' => 400 ) );
	}

	$date_range = sanitize_text_field( (string) ( $params['date_range'] ?? '' ) );
	if ( '' === $date_range ) {
		$first_date = explode( ' ', $dates[0] )[0];
		$last_date  = explode( ' ', $dates[ count( $dates ) - 1 ] )[0];
		$date_range = $first_date . ' - ' . $last_date;
	}

	$booking_data = array(
		'name'       => $first_name,
		'secondname' => array(
			'value' => $last_name,
			'type'  => 'text',
		),
		'email'      => array(
			'value' => $email,
			'type'  => 'email',
		),
		'phone'      => array(
			'value' => $phone,
			'type'  => 'text',
		),
	);

	if ( '' !== $time_range_value ) {
		$booking_data['rangetime'] = array(
			'value' => $time_range_value,
			'type'  => 'selectbox-one',
		);
	}

	$adults_key        = my_custom_wpbc_get_field_key( 'WPBC_CUSTOM_FIELD_ADULTS', 'adults' );
	$children_key      = my_custom_wpbc_get_field_key( 'WPBC_CUSTOM_FIELD_CHILDREN', 'children' );
	$license_plate_key = my_custom_wpbc_get_field_key( 'WPBC_CUSTOM_FIELD_LICENSE_PLATE', 'license_plate' );
	$date_range_key    = my_custom_wpbc_get_field_key( 'WPBC_CUSTOM_FIELD_DATE_RANGE', 'date_range' );

	if ( array_key_exists( 'adults', $params ) ) {
		$adults = max( 1, absint( $params['adults'] ) );
		$booking_data[ $adults_key ] = array(
			'value' => (string) $adults,
			'type'  => 'text',
		);
	}

	if ( array_key_exists( 'children', $params ) ) {
		$children = max( 0, absint( $params['children'] ) );
		$booking_data[ $children_key ] = array(
			'value' => (string) $children,
			'type'  => 'text',
		);
	}

	if ( '' !== $date_range ) {
		$booking_data[ $date_range_key ] = array(
			'value' => $date_range,
			'type'  => 'text',
		);
	}

	$license_plate = sanitize_text_field( (string) ( $params['license_plate'] ?? '' ) );
	if ( '' !== $license_plate ) {
		$booking_data[ $license_plate_key ] = array(
			'value' => $license_plate,
			'type'  => 'text',
		);
	}

	$booking_options = array(
		'is_send_emeils' => 1,
	);

	$result = wpbc_api_booking_add_new( $dates, $booking_data, $resource_id, $booking_options );

	if ( is_wp_error( $result ) ) {
		return new WP_Error( 'booking_failed', $result->get_error_message(), array( 'status' => 500 ) );
	}

	$booking_id = my_custom_wpbc_extract_booking_id( $result );
	if ( null === $booking_id ) {
		return new WP_Error(
			'booking_response_invalid',
			'Booking was created but booking_id could not be determined.',
			array( 'status' => 502 )
		);
	}

	$correlation_id = sanitize_text_field( (string) ( $params['correlation_id'] ?? '' ) );

	return new WP_REST_Response(
		array(
			'success'        => true,
			'booking_id'     => $booking_id,
			'correlation_id' => $correlation_id,
		),
		200
	);
}

add_action( 'rest_api_init', function () {
	register_rest_route(
		'wpbc-custom/v1',
		'/create-booking',
		array(
			array(
				'methods'             => WP_REST_Server::CREATABLE,
				'callback'            => 'my_custom_wpbc_handler',
				'permission_callback' => 'my_custom_wpbc_permission',
			),
			array(
				'methods'             => 'OPTIONS',
				'callback'            => function () {
					return new WP_REST_Response( null, 204 );
				},
				'permission_callback' => '__return_true',
			),
		)
	);
} );

add_filter( 'rest_pre_serve_request', function ( $served, $result, $request, $server ) {
	$route = $request->get_route();
	if ( 0 !== strpos( $route, '/wpbc-custom/v1/create-booking' ) ) {
		return $served;
	}

	$allowed_origins_raw = defined( 'WPBC_CUSTOM_ALLOWED_ORIGINS' ) ? (string) WPBC_CUSTOM_ALLOWED_ORIGINS : '';
	$allowed_origins     = array_filter( array_map( 'trim', explode( ',', $allowed_origins_raw ) ) );
	$origin              = get_http_origin();

	if ( $origin && in_array( $origin, $allowed_origins, true ) ) {
		header( 'Access-Control-Allow-Origin: ' . $origin );
		header( 'Vary: Origin', false );
		header( 'Access-Control-Allow-Credentials: true' );
	}

	header( 'Access-Control-Allow-Methods: POST, OPTIONS' );
	header( 'Access-Control-Allow-Headers: Content-Type, X-Marina-Signature, X-Marina-Timestamp, X-Marina-Correlation-Id' );

	return $served;
}, 10, 4 );

