define(["./Route"], function RouterPiece(Route) {

	var route = new Route();

	function RouterPiece(page) {

		this.page = page;

		var word;

		if (typeof page.route == "function") {

			word = {

				set: function(route) {

					page.route(route);
				},
				get: function() {

					return page.route();
				}
			};
		}
		else {

			word = {

				set: function(route) {

					page.route = route;
				},
				get: function() {

					return page.route;
				}
			};
		}

		route.addRoute(word);

		this.onBind = function(element) {

			var hidden = document.createElement("DIV");
			hidden.dataset.bind = "route";
			hidden.style.display = "none";

			var container = document.createElement("DIV");
			container.dataset.bind = "page";

			element.appendChild(hidden);
			element.appendChild(container);
		};

		this.route =
			Update(function() {

				route.update();
			});
	}

	return RouterPiece;
});
