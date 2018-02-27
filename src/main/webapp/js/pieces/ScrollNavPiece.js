define(["./Route"], function(Route) {

	var route = new Route();

	function ScrollNavPiece(pages) {

		var activeIndex = new Datum(0);

		var container = null;

		var routeIndex = -1;

		this.pages = new Array(pages.length);

		for (var i = 0; i < pages.length; i++) {

			this.pages[i] = pages[i].page;
		}

		this.onBind = function(element) {

			var page = document.createElement("DIV");

			container = document.createElement("DIV");
			container.dataset.bind = "pages";
			container.appendChild(page);

			var hidden = document.createElement("DIV");
			hidden.dataset.bind = "route";
			hidden.style.display = "none";

			element.appendChild(hidden);
			element.appendChild(container);

			routeIndex =
				route.addRoute({

					set: function(word, routeIndex) {

						routePage(word);
						route.update(routeIndex);
					},
					get: function() {

						return pages[activeIndex()].route;
					}
				});
		};

		this.route =
			new Destroy(function() {

				route.remove(routeIndex);
			});

		function routePage(hash) {

			for (var i = 0; i < pages.length; i++) {

				if (pages[i].route == hash) {

					container.children[i].scrollIntoView();
					activeIndex(i);

					return;
				}
			}

			activeIndex(0);
		}

		this.showPage = function(index) {

			container.children[index].scrollIntoView();
			activeIndex(index);
			route.update(routeIndex);
		};

		this.getCurrentIndex = function() {

			return activeIndex();
		};
	}

	return ScrollNavPiece;
});
